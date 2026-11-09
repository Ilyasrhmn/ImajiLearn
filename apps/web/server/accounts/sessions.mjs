import { object, text } from "../../../../packages/contracts/validation.mjs";
import { ApiError } from "../core/errors.mjs";
import { endpoint, readJson } from "../core/http.mjs";
import { digest } from "../core/crypto.mjs";
import { checkRateLimit, consumeRateLimit } from "../core/rate-limit.mjs";
import { parseEmail } from "./registration-contract.mjs";
import { verifyPassword } from "./password.mjs";
import { issueSession } from "./session-issuer.mjs";
import { sessionToken, sessionCookie } from "./session-cookie.mjs";

// Unknown emails still perform the same password derivation before the generic rejection.
const dummyHash = `scrypt$32768$8$1$${"0".repeat(32)}$${"0".repeat(128)}`;
const publicTeacher = ({ id, name, email, school, grade }) => ({ id, name, email, school, grade });
const minute = 60000;

export function createSessionHandlers(db, config) {
  const secure = config.origin.startsWith("https://");
  async function readSession(request) {
    const token = sessionToken(request, secure);
    const unauthorized = () => new ApiError(401, "SESSION_REQUIRED", "Masuk untuk melanjutkan.");
    if (!token) throw unauthorized();
    const tokenHash = digest(token), now = new Date();
    const touched = await db.session.updateMany({
      where: { tokenHash, expiresAt: { gt: now }, lastSeen: { gt: new Date(now.getTime() - (config.sessionIdleSeconds ?? 86400) * 1000) } },
      data: { lastSeen: now },
    });
    if (!touched.count) throw unauthorized();
    const row = await db.session.findUnique({ where: { tokenHash }, include: {
      teacher: { select: { id: true, name: true, email: true, school: true, grade: true } },
    } });
    if (!row) throw unauthorized();
    return { user: row.teacher, expiresAt: row.expiresAt.toISOString() };
  }
  return {
    requireTeacher: async request => {
      const { user } = await readSession(request);
      const expected = request.headers.get("x-teacher-id");
      if (expected !== null && expected !== user.id) {
        throw new ApiError(409, "ACCOUNT_CHANGED", "Akun aktif sudah berubah. Muat ulang halaman.");
      }
      return user;
    },
    session: endpoint(async request => Response.json({ data: await readSession(request) }), config.origin),
    login: endpoint(async request => {
      const body = await readJson(request);
      object(body, ["email", "password"]);
      const email = parseEmail(body.email), password = text(body.password, "password", 128, { min: 1, trim: false });
      const ip = config.trustedIpHeader ? (request.headers.get(config.trustedIpHeader)?.slice(0, 200) || "unknown") : "shared";
      const failureKey = `login:${email}:${ip}`, windowMs = 15 * minute, failureMax = config.loginFailureLimit ?? 5;
      await consumeRateLimit(db, `login-ip:${ip}`, config.loginIpLimit ?? 30, windowMs);
      await checkRateLimit(db, failureKey, failureMax, windowMs);
      const teacher = await db.teacher.findUnique({ where: { email } });
      const matches = await verifyPassword(password, teacher?.passwordHash ?? dummyHash);
      if (!teacher || !matches) {
        await consumeRateLimit(db, failureKey, failureMax, windowMs);
        throw new ApiError(401, "INVALID_CREDENTIALS", "Email atau kata sandi salah.");
      }
      await checkRateLimit(db, failureKey, failureMax, windowMs);
      const session = await db.$transaction(async tx => {
        // A password change and session issuance must acquire the same teacher lock.
        const [locked] = await tx.$queryRaw`SELECT "passwordHash" FROM "Teacher" WHERE "id" = ${teacher.id}::uuid FOR UPDATE`;
        if (locked?.passwordHash !== teacher.passwordHash) {
          throw new ApiError(401, "INVALID_CREDENTIALS", "Email atau kata sandi salah.");
        }
        const previous = sessionToken(request, secure);
        if (previous) await tx.session.deleteMany({ where: { tokenHash: digest(previous) } });
        const issued = await issueSession(tx, teacher.id, { secure, absoluteSeconds: config.sessionAbsoluteSeconds ?? 604800 });
        await tx.rateLimit.deleteMany({ where: { key: digest(failureKey) } });
        return issued;
      });
      return Response.json({ data: { user: publicTeacher(teacher), expiresAt: session.expiresAt } }, { headers: { "set-cookie": session.cookie } });
    }, config.origin),
    logout: endpoint(async request => {
      const token = sessionToken(request, secure);
      if (token) await db.session.deleteMany({ where: { tokenHash: digest(token) } });
      return new Response(null, { status: 204, headers: { "set-cookie": sessionCookie("", secure, 0) } });
    }, config.origin),
  };
}
