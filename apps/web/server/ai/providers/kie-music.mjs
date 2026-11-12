import { AIError } from "../errors.mjs";
import { musicPrompt, musicPromptVersion } from "../music-direction.mjs";

const validId = value => typeof value === "string" && /^[a-z\d_-]{8,128}$/i.test(value);
const audioHosts = new Set(["tempfile.aiquickdraw.com", "tempfile.redpandaai.co", "cdn1.suno.ai", "cdn2.suno.ai"]);

async function boundedBytes(response, limit) {
  if (Number(response.headers.get("content-length")) > limit) {
    await response.body?.cancel();
    throw new AIError("RESPONSE_TOO_LARGE");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new AIError("INVALID_PROVIDER_RESPONSE");
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new AIError("RESPONSE_TOO_LARGE"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, size);
}

export function createKieMusic(env = process.env, transport = fetch) {
  const setting = (name, fallback = "") => {
    if (env[name] === undefined) return fallback;
    if (typeof env[name] !== "string") throw new AIError("INVALID_AI_CONFIG", { field: name });
    return env[name].trim() || fallback;
  };
  const key = setting("KIE_API_KEY");
  if (!key) throw new AIError("AI_NOT_CONFIGURED", { field: "KIE_API_KEY" });
  const base = setting("AI_MUSIC_BASE_URL", "https://api.kie.ai/api/v1").replace(/\/$/, "");
  const model = setting("AI_MUSIC_MODEL", "V6");
  const timeout = Number(setting("AI_MUSIC_TIMEOUT_MS", "20000"));
  const duration = Number(setting("AI_MUSIC_DURATION_SECONDS", "120"));
  if (base !== "https://api.kie.ai/api/v1" || model !== "V6" || key.length > 4096 || /[\u0000-\u0020\u007f]/u.test(key) ||
      !Number.isInteger(timeout) || timeout < 1000 || timeout > 60000 || !Number.isInteger(duration) || duration < 10 || duration > 360) throw new AIError("INVALID_AI_CONFIG");

  async function json(path, body) {
    const submitting = body !== undefined;
    try {
      const response = await transport(base + path, {
        method: submitting ? "POST" : "GET", redirect: "error", cache: "no-store",
        headers: { Authorization: "Bearer " + key, ...(submitting ? { "Content-Type": "application/json" } : {}) },
        body: submitting ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeout),
      });
      const known = { 400: "PROVIDER_REQUEST_REJECTED", 401: "PROVIDER_AUTH_ERROR", 402: "MUSIC_CREDITS_REQUIRED", 403: "PROVIDER_AUTH_ERROR", 422: "PROVIDER_REQUEST_REJECTED", 429: "RATE_LIMITED" };
      if (!response.ok) {
        await response.body?.cancel();
        throw new AIError(known[response.status] ?? (submitting ? "MUSIC_REQUEST_UNKNOWN" : "PROVIDER_UNAVAILABLE"));
      }
      let payload;
      try { payload = JSON.parse((await boundedBytes(response, 512 * 1024)).toString("utf8")); }
      catch { throw new AIError(submitting ? "MUSIC_REQUEST_UNKNOWN" : "INVALID_PROVIDER_RESPONSE"); }
      if (!response.ok || payload?.code !== 200) {
        throw new AIError(known[response.ok ? payload?.code : response.status] ?? (submitting ? "MUSIC_REQUEST_UNKNOWN" : "PROVIDER_UNAVAILABLE"));
      }
      if (!payload.data || typeof payload.data !== "object") throw new AIError(submitting ? "MUSIC_REQUEST_UNKNOWN" : "INVALID_PROVIDER_RESPONSE");
      return payload.data;
    } catch (error) {
      if (error instanceof AIError) throw error;
      throw new AIError(submitting ? "MUSIC_REQUEST_UNKNOWN" : "PROVIDER_UNAVAILABLE");
    }
  }

  return {
    describe() { return { provider: "kie-suno", requestedModel: model, durationHint: duration, musicPromptVersion }; },
    async create({ lyrics, title = "Lagu belajar" }) {
      if (typeof lyrics !== "string" || lyrics.length < 8 || lyrics.length > 5000 || typeof title !== "string" || !title.trim()) throw new AIError("INVALID_AI_INPUT");
      const data = await json("/jobs/createTask", { model: "ai-music-api/generate", input: {
        custom_mode: true, instrumental: false, model, title: Array.from(title.trim()).slice(0, 80).join(""), lyrics,
        style: musicPrompt, vocal_gender: "f", duration,
      } });
      if (!validId(data.taskId)) throw new AIError("MUSIC_REQUEST_UNKNOWN");
      return data.taskId;
    },
    async retrieve(id, audioId) {
      if (!validId(id)) throw new AIError("INVALID_AI_INPUT");
      const data = await json("/jobs/recordInfo?taskId=" + encodeURIComponent(id));
      if (data.taskId !== id) throw new AIError("INVALID_PROVIDER_RESPONSE");
      if (data.state === "fail") return { status: "FAILURE" };
      if (["waiting", "queuing", "generating"].includes(data.state)) return { status: "PENDING" };
      if (data.state !== "success") throw new AIError("INVALID_PROVIDER_RESPONSE");
      let result;
      try { result = data.resultJson ? JSON.parse(data.resultJson) : data.response; }
      catch { throw new AIError("INVALID_PROVIDER_RESPONSE"); }
      if (!Array.isArray(result?.data) || result.data.length > 8) throw new AIError("INVALID_PROVIDER_RESPONSE");
      const tracks = result.data.map(item => {
        if (!item || typeof item.id !== "string" || !/^[a-z\d_-]{1,128}$/i.test(item.id) || typeof item.audio_url !== "string") throw new AIError("INVALID_PROVIDER_RESPONSE");
        return { audioId: item.id, audioUrl: item.audio_url };
      });
      if (new Set(tracks.map(item => item.audioId)).size !== tracks.length) throw new AIError("INVALID_PROVIDER_RESPONSE");
      const track = audioId ? result?.data?.find(item => item.id === audioId) : result?.data?.[0];
      if (!track || typeof track.id !== "string" || !/^[a-z\d_-]{1,128}$/i.test(track.id) || typeof track.audio_url !== "string") throw new AIError("INVALID_PROVIDER_RESPONSE");
      return { status: "SUCCESS", tracks, audioId: track.id, song_paths: [track.audio_url], model_version: track.model_name, tags: typeof track.tags === "string" ? track.tags.split(/,\s*/) : [] };
    },
    async align(task, audio) {
      if (!validId(task) || typeof audio !== "string" || !/^[a-z\d_-]{1,128}$/i.test(audio)) throw new AIError("INVALID_AI_INPUT");
      const result = await json("/jobs/createTask", { model: "ai-music-api/timeStamped-lyrics", input: { task_id: task, audio_id: audio } });
      if (result.code !== 200 || !Array.isArray(result.data?.alignedWords) || result.data.alignedWords.length > 1000) throw new AIError("INVALID_PROVIDER_RESPONSE");
      return result.data.alignedWords.map(word => ({ word: word.word, start: word.startS, end: word.endS }));
    },
    async download(value) {
      let url;
      try { url = new URL(value); } catch { throw new AIError("INVALID_PROVIDER_RESPONSE"); }
      if (url.protocol !== "https:" || !audioHosts.has(url.hostname) || url.port || url.username || url.password) throw new AIError("INVALID_PROVIDER_RESPONSE");
      try {
        const response = await transport(url, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(60_000) });
        if (!response.ok || !["audio/mpeg", "audio/mp3", "application/octet-stream"].includes(response.headers.get("content-type")?.split(";")[0].toLowerCase())) {
          await response.body?.cancel(); throw new AIError("INVALID_PROVIDER_RESPONSE");
        }
        const bytes = await boundedBytes(response, 20 * 1024 * 1024);
        if (bytes.length < 128 || !(bytes.subarray(0, 3).toString() === "ID3" || (bytes[0] === 255 && (bytes[1] & 224) === 224))) throw new AIError("INVALID_PROVIDER_RESPONSE");
        return bytes;
      } catch (error) {
        if (error instanceof AIError) throw error;
        throw new AIError("PROVIDER_UNAVAILABLE");
      }
    },
  };
}
