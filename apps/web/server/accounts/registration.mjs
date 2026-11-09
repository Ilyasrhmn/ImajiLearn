import { endpoint, readJson } from "../core/http.mjs";
import { ApiError } from "../core/errors.mjs";
import { consumeRateLimit } from "../core/rate-limit.mjs";
import { parseRegistration } from "./registration-contract.mjs";
import { hashPassword } from "./password.mjs";
import { issueSession } from "./session-issuer.mjs";

export function createRegistrationHandler(db, config) {
  return endpoint(async request => {
    const body = parseRegistration(await readJson(request));
    // A reverse proxy must strip and replace this header before it can be trusted.
    const ip = config.trustedIpHeader ? (request.headers.get(config.trustedIpHeader)?.slice(0, 200) || "unknown") : "shared";
    await consumeRateLimit(db, `register:${ip}`, config.registerLimit ?? 5, 3600000);
    const passwordHash = await hashPassword(body.password);
    let result;
    try {
      result = await db.$transaction(async tx => {
        const { id, name, email, school, grade } = await tx.teacher.create({ data: { name: body.name, email: body.email, passwordHash } });
        const session = await issueSession(tx, id, { secure: config.origin.startsWith("https://"), absoluteSeconds: config.sessionAbsoluteSeconds ?? 604800 });
        return { user: { id, name, email, school, grade }, ...session };
      });
    } catch (error) {
      if (error.code === "P2002") throw new ApiError(409, "EMAIL_IN_USE", "Email sudah digunakan.", { email: "Gunakan email lain atau masuk." });
      throw error;
    }
    const { cookie, ...data } = result;
    return Response.json({ data }, { status: 201, headers: { "set-cookie": cookie } });
  }, config.origin);
}
