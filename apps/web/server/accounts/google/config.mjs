import { ApiError } from "../../core/errors.mjs";

export function googleConfig(env = process.env) {
  const unavailable = () => new ApiError(503, "GOOGLE_UNAVAILABLE", "Masuk dengan Google belum tersedia. Gunakan email dan kata sandi.");
  try {
    const origin = new URL(env.APP_ORIGIN);
    if (!["http:", "https:"].includes(origin.protocol) || origin.origin !== env.APP_ORIGIN ||
        (env.NODE_ENV === "production" && origin.protocol !== "https:")) throw unavailable();
    for (const value of [env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET]) {
      if (typeof value !== "string" || !value.trim() || value.length > 2048 || /\s/.test(value)) throw unavailable();
    }
    const googleStartLimit = env.GOOGLE_START_LIMIT === undefined ? 20 : Number(env.GOOGLE_START_LIMIT);
    if (!Number.isSafeInteger(googleStartLimit) || googleStartLimit <= 0) throw unavailable();
    return { origin: origin.origin, clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET,
      googleEnabled: true, googleStartLimit };
  } catch { throw unavailable(); }
}

export function isGoogleAuthEnabled(env = process.env) {
  try { googleConfig(env); return true; } catch { return false; }
}
