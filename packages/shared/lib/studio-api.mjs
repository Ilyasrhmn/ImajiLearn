import { apiPath, navigateAfterSessionChange, sessionLoginPath } from "./session.mjs";
import { createId } from "./id.mjs";
import { aiCorrection, aiRepairHeader } from "./ai-repair.mjs";

export async function studioRequest(teacherId, path, { method = "GET", body, version, key, signal, binary = false, repairCode } = {}) {
  const headers = { "X-Teacher-Id": teacherId };
  if (version !== undefined) headers["If-Match"] = `"${version}"`;
  if (method === "POST") headers["Idempotency-Key"] = key ?? createId();
  if (method === "POST" && aiCorrection(repairCode)) headers[aiRepairHeader] = repairCode;
  const multipart = body instanceof FormData;
  if (body !== undefined && !multipart) headers["Content-Type"] = "application/json";
  const response = await fetch(apiPath(path), {
    method, headers, signal, cache: "no-store",
    body: multipart ? body : body === undefined ? undefined : JSON.stringify(body),
  }).catch(error => {
    signal?.throwIfAborted();
    if (error.name === "AbortError") throw error;
    throw new Error("Layanan belum dapat dihubungi. Periksa koneksi dan coba lagi.");
  });
  signal?.throwIfAborted();
  if (response.status === 401) navigateAfterSessionChange(sessionLoginPath());
  if (response.ok && binary) return response.blob();
  if (response.status === 204) return null;
  const result = await response.json().catch(() => null);
  if (result?.error?.code === "ACCOUNT_CHANGED") window.location.reload();
  if (!response.ok || !result || !Object.hasOwn(result, "data")) {
    const error = new Error(result?.error?.message || "Permintaan belum berhasil. Coba lagi.");
    error.status = response.status;
    error.code = result?.error?.code;
    const retryAfter = response.headers.get("retry-after");
    if (retryAfter && /^\d+$/.test(retryAfter)) error.retryAfterSeconds = Number(retryAfter);
    throw error;
  }
  return result;
}
