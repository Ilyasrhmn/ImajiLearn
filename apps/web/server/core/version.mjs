import { ApiError } from "./errors.mjs";

export function expectedVersion(request) {
  const value = request.headers.get("if-match");
  if (!value) throw new ApiError(428, "VERSION_REQUIRED", "Kirim If-Match dari versi data terakhir.");
  if (!/^"(0|[1-9]\d*)"$/.test(value) || !Number.isSafeInteger(Number(value.slice(1, -1)))) {
    throw new ApiError(400, "INVALID_VERSION", "Format If-Match tidak valid.");
  }
  return Number(value.slice(1, -1));
}

export const etag = version => ({ etag: `"${version}"` });
