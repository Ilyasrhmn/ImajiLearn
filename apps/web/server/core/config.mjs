import { ApiError } from "./errors.mjs";

function positive(name, fallback) {
  const value = process.env[name] === undefined ? fallback : Number(process.env[name]);
  if (!Number.isSafeInteger(value) || value <= 0) throw new ApiError(503, "CONFIGURATION_ERROR", "Konfigurasi layanan belum valid.");
  return value;
}

export function registrationConfig() {
  const origin = process.env.APP_ORIGIN;
  let valid = false;
  try {
    const parsed = new URL(origin);
    valid = ["http:", "https:"].includes(parsed.protocol) && parsed.origin === origin &&
      (process.env.NODE_ENV !== "production" || parsed.protocol === "https:");
  } catch { /* The public error must not include environment values. */ }
  if (!valid) throw new ApiError(503, "CONFIGURATION_ERROR", "Origin aplikasi belum dikonfigurasi dengan benar.");
  return { origin,
    registerLimit: positive("REGISTER_IP_LIMIT", 5),
    sessionAbsoluteSeconds: positive("SESSION_ABSOLUTE_SECONDS", 604800),
    trustedIpHeader: process.env.TRUSTED_CLIENT_IP_HEADER || undefined,
  };
}
