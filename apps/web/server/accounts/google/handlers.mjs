import { randomBytes, createHash } from "node:crypto";
import { object, text } from "../../../../../packages/contracts/validation.mjs";
import { ApiError } from "../../core/errors.mjs";
import { endpoint, readJson } from "../../core/http.mjs";
import { digest } from "../../core/crypto.mjs";
import { consumeRateLimit } from "../../core/rate-limit.mjs";
import { verifyPassword } from "../password.mjs";
import { createSessionHandlers } from "../sessions.mjs";
import { sessionToken } from "../session-cookie.mjs";
import { issueSession } from "../session-issuer.mjs";
import { createGoogleProvider } from "./provider.mjs";

const lifetime = 600;
const opaque = () => randomBytes(32).toString("base64url");
const flowCookieName = secure => secure ? "__Host-imajilearn_google_flow" : "imajilearn_google_flow";
function flowCookie(token, secure, maxAge) {
  return `${flowCookieName(secure)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}
function browserToken(request, secure) {
  const name = flowCookieName(secure);
  const cookies = (request.headers.get("cookie") ?? "").split(";").map(value => value.trim()).filter(value => value.startsWith(`${name}=`));
  const value = cookies.length === 1 ? cookies[0].slice(name.length + 1) : "";
  return /^[a-f\d]{64}$/.test(value) ? value : null;
}
class FlowError extends Error {
  constructor(code) { super(code); this.code = code; }
}

export function createGoogleHandlers(db, config, { provider = createGoogleProvider(config) } = {}) {
  const secure = config.origin.startsWith("https://");
  const { requireTeacher } = createSessionHandlers(db, config);
  async function start(request, binding) {
    const ip = config.trustedIpHeader ? (request.headers.get(config.trustedIpHeader)?.slice(0, 200) || "unknown") : "shared";
    await consumeRateLimit(db, `google-start:${ip}`, config.googleStartLimit ?? 20, 15 * 60000);
    const now = new Date();
    await db.$executeRaw`DELETE FROM "GoogleOAuthFlow" WHERE "tokenHash" IN (SELECT "tokenHash" FROM "GoogleOAuthFlow" WHERE "expiresAt" <= ${now} ORDER BY "expiresAt" LIMIT 100)`;
    const token = randomBytes(32).toString("hex"), state = opaque(), nonce = opaque(), verifier = opaque();
    await db.googleOAuthFlow.create({ data: { tokenHash: digest(token), stateHash: digest(state), nonceHash: digest(nonce),
      verifier, intent: binding ? "link" : "login", ...binding, expiresAt: new Date(now.getTime() + lifetime * 1000) } });
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    for (const [key, value] of Object.entries({ client_id: config.clientId, redirect_uri: `${config.origin}/api/v1/auth/google/callback`,
      response_type: "code", scope: "openid email profile", state, nonce, prompt: "select_account",
      code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" })) url.searchParams.set(key, value);
    return Response.json({ data: { url: url.toString() } }, { headers: { "set-cookie": flowCookie(token, secure, lifetime) } });
  }
  async function completeLink(tx, flow, identity, request) {
    const [teacher] = await tx.$queryRaw`SELECT "id", "email", "passwordHash" FROM "Teacher" WHERE "id" = ${flow.teacherId}::uuid FOR UPDATE`;
    if (!teacher || teacher.passwordHash !== flow.passwordHashSnapshot) throw new FlowError("expired");
    const currentToken = sessionToken(request, secure);
    if (!currentToken || digest(currentToken) !== flow.sessionTokenHash) throw new FlowError("expired");
    // This row lock also serializes against logout's DELETE and password change's session revocation.
    const [session] = await tx.$queryRaw`SELECT "userId", "expiresAt", "lastSeen" FROM "Session" WHERE "tokenHash" = ${flow.sessionTokenHash} FOR UPDATE`;
    const now = Date.now();
    if (flow.expiresAt.getTime() <= now || !session || session.userId !== teacher.id || session.expiresAt.getTime() <= now ||
        session.lastSeen.getTime() + (config.sessionIdleSeconds ?? 86400) * 1000 <= now) throw new FlowError("expired");
    if (teacher.email !== identity.email) throw new FlowError("email_mismatch");
    if (await tx.googleIdentity.findUnique({ where: { teacherId: teacher.id } })) throw new FlowError("already_linked");
    if (await tx.googleIdentity.findUnique({ where: { sub: identity.sub } })) throw new FlowError("conflict");
    await tx.googleIdentity.create({ data: { sub: identity.sub, teacherId: teacher.id } });
  }
  async function completeLogin(tx, flow, identity, request) {
    const linked = await tx.googleIdentity.findUnique({ where: { sub: identity.sub } });
    let teacherId = linked?.teacherId;
    if (teacherId) {
      await tx.$queryRaw`SELECT "id" FROM "Teacher" WHERE "id" = ${teacherId}::uuid FOR UPDATE`;
    } else {
      if (await tx.teacher.findUnique({ where: { email: identity.email }, select: { id: true } })) throw new FlowError("email_exists");
      const teacher = await tx.teacher.create({ data: { name: identity.name, email: identity.email, passwordHash: null } });
      teacherId = teacher.id;
      await tx.googleIdentity.create({ data: { sub: identity.sub, teacherId } });
    }
    const previous = sessionToken(request, secure);
    if (previous) await tx.session.deleteMany({ where: { tokenHash: digest(previous) } });
    if (flow.expiresAt.getTime() <= Date.now()) throw new FlowError("expired");
    return issueSession(tx, teacherId, { secure, absoluteSeconds: config.sessionAbsoluteSeconds ?? 604800 });
  }
  return {
    start: endpoint(request => start(request), config.origin),
    link: endpoint(async request => {
      const teacher = await requireTeacher(request);
      const body = await readJson(request); object(body, ["currentPassword"]);
      const password = text(body.currentPassword, "currentPassword", 128, { min: 1, trim: false });
      await consumeRateLimit(db, `google-link:${teacher.id}`, 5, 15 * 60000);
      const credentials = await db.teacher.findUnique({ where: { id: teacher.id }, include: { googleIdentity: true } });
      if (!credentials?.passwordHash) throw new ApiError(422, "PASSWORD_UNAVAILABLE", "Akun ini masuk menggunakan Google.");
      if (!await verifyPassword(password, credentials.passwordHash)) throw new ApiError(422, "INVALID_PASSWORD", "Kata sandi saat ini salah.", { currentPassword: "Kata sandi saat ini salah." });
      if (credentials.googleIdentity) throw new ApiError(409, "GOOGLE_ALREADY_LINKED", "Akun Google sudah terhubung.");
      const token = sessionToken(request, secure);
      return start(request, { teacherId: teacher.id, sessionTokenHash: digest(token), passwordHashSnapshot: credentials.passwordHash });
    }, config.origin),
    callback: async request => {
      let intent = "login", session;
      const redirect = code => new Response(null, { status: 303, headers: { location: `${intent === "link" ? "/akun" : "/masuk"}?google=${code}`,
        "set-cookie": flowCookie("", secure, 0), "cache-control": "no-store", "referrer-policy": "no-referrer" } });
      try {
        const params = new URL(request.url).searchParams, token = browserToken(request, secure);
        const state = params.get("state");
        if (!token || params.getAll("state").length !== 1 || !/^[A-Za-z0-9_-]{43}$/.test(state ?? "")) throw new FlowError("expired");
        const tokenHash = digest(token), stateHash = digest(state), now = new Date();
        // DELETE RETURNING gives only one callback access to the verifier, including simultaneous callbacks.
        const [flow] = await db.$queryRaw`DELETE FROM "GoogleOAuthFlow" WHERE "tokenHash" = ${tokenHash} AND "stateHash" = ${stateHash} AND "expiresAt" > ${now} RETURNING *`;
        if (!flow) throw new FlowError("expired");
        intent = flow.intent;
        if (params.getAll("error").length === 1 && !params.has("code")) throw new FlowError(params.get("error") === "access_denied" ? "cancelled" : "failed");
        const code = params.get("code");
        if (params.has("error") || params.getAll("code").length !== 1 || !code || code.length > 4096 || /[\u0000-\u0020\u007f]/.test(code)) throw new FlowError("failed");
        const identity = await provider.exchange({ code, verifier: flow.verifier, nonceHash: flow.nonceHash });
        session = await db.$transaction(tx => intent === "link" ? completeLink(tx, flow, identity, request) : completeLogin(tx, flow, identity, request));
      } catch (error) {
        return redirect(error instanceof FlowError ? error.code : error?.code === "P2002" ? "conflict" : "failed");
      }
      const response = redirect(intent === "link" ? "linked" : "signed_in");
      if (intent === "login") {
        response.headers.set("location", "/beranda?google=signed_in");
        response.headers.append("set-cookie", session.cookie);
      }
      return response;
    },
  };
}
