import { setTimeout as wait } from "node:timers/promises";
import { ApiError } from "../../core/errors.mjs";

const base = "https://api.kie.ai/api/v1";
const validTask = value => typeof value === "string" && /^[a-z\d_-]{8,128}$/i.test(value);
const invalid = () => new ApiError(502, "INVALID_ILLUSTRATION", "Gambar dari layanan belum bisa ditampilkan. Coba lagi.");
const unknown = () => new ApiError(503, "ILLUSTRATION_REQUEST_UNKNOWN", "Status permintaan gambar belum pasti. Hubungi pengelola sebelum membuat ulang.");
const unavailable = () => new ApiError(503, "ILLUSTRATION_UNAVAILABLE", "Layanan ilustrasi belum tersedia. Coba lagi nanti.");

async function readBytes(response, limit) {
  const reader = response.body?.getReader();
  if (!reader) throw invalid();
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw invalid(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, size);
}

function providerError(code) {
  if (code === 402) return new ApiError(429, "ILLUSTRATION_QUOTA_EXHAUSTED", "Kredit gambar habis. Hubungi pengelola.");
  if (code === 429) return new ApiError(429, "ILLUSTRATION_RATE_LIMITED", "Permintaan gambar sedang dibatasi. Coba lagi sebentar.");
  if (code === 401 || code === 403) return new ApiError(503, "ILLUSTRATION_ACCESS_DENIED", "Akses layanan gambar belum aktif. Hubungi pengelola.");
  if (code === 400 || code === 422) return new ApiError(502, "INVALID_ILLUSTRATION_PLAN", "Arahan gambar belum bisa diproses. Coba lagi.");
  return unavailable();
}

export function createKieImage(env = process.env, transport = fetch, sleep = wait) {
  return async (prompt, { taskId, onTask = async () => {} } = {}) => {
    const key = env.KIE_API_KEY?.trim();
    if (!key || key.length > 4096 || /[\u0000-\u0020\u007f]/u.test(key)) throw unavailable();
    if (taskId === "submitting") throw unknown();
    if (taskId && !validTask(taskId)) throw invalid();
    if (!taskId && (typeof prompt !== "string" || !prompt.trim() || Array.from(prompt).length > 1000)) {
      throw new ApiError(502, "INVALID_ILLUSTRATION_PLAN", "Arahan gambar harus berisi maksimal 1.000 karakter.");
    }
    const deadline = AbortSignal.timeout(90_000);
    async function json(path, body) {
      const response = await transport(base + path, {
        method: body ? "POST" : "GET", redirect: "error", cache: "no-store",
        signal: AbortSignal.any([deadline, AbortSignal.timeout(20_000)]),
        headers: { Authorization: "Bearer " + key, ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!response.ok) { await response.body?.cancel(); throw providerError(response.status); }
      const payload = JSON.parse((await readBytes(response, 256 * 1024)).toString("utf8"));
      if (payload?.code !== 200) throw providerError(payload?.code);
      return payload.data;
    }
    try {
      if (!taskId) {
        // Reserve before the paid POST; an ambiguous response must never resubmit automatically.
        await onTask("submitting");
        let data;
        try { data = await json("/jobs/createTask", { model: "z-image", input: { prompt, aspect_ratio: "16:9" } }); }
        catch (error) {
          if (error instanceof ApiError && ["ILLUSTRATION_QUOTA_EXHAUSTED", "ILLUSTRATION_RATE_LIMITED", "ILLUSTRATION_ACCESS_DENIED", "INVALID_ILLUSTRATION_PLAN"].includes(error.code)) {
            await onTask(null); throw error;
          }
          throw unknown();
        }
        if (!validTask(data?.taskId)) throw unknown();
        taskId = data.taskId;
        await onTask(taskId);
      }
      while (true) {
        const data = await json("/jobs/recordInfo?taskId=" + encodeURIComponent(taskId));
        if (data?.taskId !== taskId) throw invalid();
        if (data.state === "fail") { await onTask(null); throw unavailable(); }
        if (["waiting", "queuing", "generating"].includes(data.state)) {
          await sleep(2000, undefined, { signal: deadline }); continue;
        }
        if (data.state !== "success") throw invalid();
        const urls = JSON.parse(data.resultJson)?.resultUrls;
        if (!Array.isArray(urls) || !urls.length) throw invalid();
        const url = new URL(urls[0]);
        if (url.protocol !== "https:" || url.hostname !== "tempfile.aiquickdraw.com" || url.port || url.username || url.password) throw invalid();
        const response = await transport(url, { redirect: "error", cache: "no-store", signal: deadline });
        if (!response.ok) { await response.body?.cancel(); throw unavailable(); }
        const bytes = await readBytes(response, 2 * 1024 * 1024);
        const png = bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
        const jpeg = bytes.subarray(0, 3).toString("hex") === "ffd8ff" && bytes.subarray(-2).toString("hex") === "ffd9";
        if (bytes.length < 32 || (!png && !jpeg)) throw invalid();
        return bytes;
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw unavailable();
    }
  };
}

export const generateIllustration = (prompt, task) => createKieImage()(prompt, task);
