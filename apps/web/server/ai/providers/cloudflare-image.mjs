import { ApiError } from "../../core/errors.mjs";

const invalidImage = () => new ApiError(502, "INVALID_ILLUSTRATION", "Gambar dari layanan belum bisa ditampilkan. Coba lagi.");
const unavailable = () => new ApiError(503, "ILLUSTRATION_UNAVAILABLE", "Layanan ilustrasi belum tersedia. Coba lagi nanti.");
const maxImageBytes = 2 * 1024 * 1024;
const maxResponseBytes = 3 * 1024 * 1024;
const model = "@cf/black-forest-labs/flux-1-schnell";

function providerError(status, payload) {
  const messages = Array.isArray(payload?.errors) ? payload.errors.map(error => error?.message ?? "").join(" ") : "";
  if (/daily free allocation|daily.*(?:limit|quota)|quota.*exceeded/iu.test(messages)) {
    return new ApiError(429, "ILLUSTRATION_QUOTA_EXHAUSTED", "Kuota gambar hari ini habis. Coba lagi setelah kuota diperbarui. Bacaan yang sudah dibuat tetap tersimpan.");
  }
  if (status === 429) return new ApiError(429, "ILLUSTRATION_RATE_LIMITED", "Permintaan gambar sedang dibatasi. Coba lagi sebentar.");
  if (status === 401 || status === 403) return new ApiError(503, "ILLUSTRATION_ACCESS_DENIED", "Akses layanan gambar belum aktif. Hubungi pengelola.");
  return unavailable();
}

async function readPayload(response) {
  const reader = response.body?.getReader();
  if (!reader) throw invalidImage();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxResponseBytes) {
        await reader.cancel();
        throw invalidImage();
      }
      chunks.push(value);
    }
    try { return JSON.parse(Buffer.concat(chunks, length).toString("utf8")); }
    catch { throw invalidImage(); }
  } finally { reader.releaseLock(); }
}

export async function generateIllustration(prompt) {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!/^[\da-f]{32}$/i.test(account ?? "") || !token) throw unavailable();

  try {
    const response = await fetch("https://api.cloudflare.com/client/v4/accounts/" + account + "/ai/run/" + model, {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, steps: 4 }),
      signal: AbortSignal.timeout(45_000),
      redirect: "error",
      cache: "no-store",
    });
    if (!response.ok) {
      const payload = await readPayload(response).catch(() => null);
      throw providerError(response.status, payload);
    }
    const payload = await readPayload(response);
    const encoded = payload?.result?.image;
    if (!payload?.success) throw providerError(response.status, payload);
    if (typeof encoded !== "string") throw invalidImage();
    const bytes = Buffer.from(encoded, "base64");
    if (bytes.length < 4 || bytes.length > maxImageBytes || bytes.subarray(0, 3).toString("hex") !== "ffd8ff" ||
        bytes.subarray(-2).toString("hex") !== "ffd9") throw invalidImage();
    return bytes;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw unavailable();
  }
}
