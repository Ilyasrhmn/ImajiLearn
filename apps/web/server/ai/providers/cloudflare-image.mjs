import { ApiError } from "../../core/errors.mjs";

export function createCloudflareImage(env = process.env, transport = fetch) {
  return async prompt => {
    const account = env.CLOUDFLARE_ACCOUNT_ID?.trim();
    const token = env.CLOUDFLARE_API_TOKEN?.trim();
    if (!/^[a-f\d]{32}$/i.test(account ?? "") || !token || /[\s\u0000-\u001f\u007f]/u.test(token)) {
      throw new ApiError(503, "ILLUSTRATION_UNAVAILABLE", "Layanan ilustrasi belum tersedia. Coba lagi nanti.");
    }
    if (typeof prompt !== "string" || !prompt.trim() || Array.from(prompt).length > 2048) {
      throw new ApiError(502, "INVALID_ILLUSTRATION_PLAN", "Arahan gambar belum bisa diproses. Coba lagi.");
    }
    try {
      const response = await transport(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/@cf/black-forest-labs/flux-1-schnell`, {
        method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(60_000),
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, steps: 4 }),
      });
      const reader = response.body?.getReader();
      if (!reader) throw new Error("missing body");
      const chunks = []; let size = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 4 * 1024 * 1024) { await reader.cancel(); throw new Error("oversized response"); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const data = JSON.parse(Buffer.concat(chunks, size).toString("utf8"));
      const codes = data.errors?.map(error => error.code) ?? [];
      if (codes.includes(3042) || codes.includes(4006)) {
        throw new ApiError(429, "ILLUSTRATION_QUOTA_EXHAUSTED", "Kuota ilustrasi Cloudflare habis. Coba lagi nanti.");
      }
      if (response.status === 429) throw new ApiError(429, "ILLUSTRATION_RATE_LIMITED", "Permintaan gambar sedang dibatasi. Coba lagi sebentar.");
      if (!response.ok || data.success !== true || typeof data.result?.image !== "string") throw new Error("provider failure");
      const bytes = Buffer.from(data.result.image, "base64");
      const png = bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
      const jpeg = bytes.subarray(0, 3).toString("hex") === "ffd8ff" && bytes.subarray(-2).toString("hex") === "ffd9";
      if (bytes.length < 32 || bytes.length > 2 * 1024 * 1024 || (!png && !jpeg)) throw new Error("invalid image");
      return bytes;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(503, "ILLUSTRATION_UNAVAILABLE", "Layanan ilustrasi belum dapat memproses permintaan. Coba lagi.");
    }
  };
}
