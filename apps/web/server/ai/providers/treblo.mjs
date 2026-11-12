import { AIError } from "../errors.mjs";
import { musicPrompt, musicPromptVersion, musicStyle } from "../music-direction.mjs";

const taskId = value => typeof value === "string" && /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value);
const maxAudio = 20 * 1024 * 1024;

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

export function createTrebloMusic(env = process.env, transport = fetch) {
  const setting = name => {
    if (env[name] === undefined) return "";
    if (typeof env[name] !== "string") throw new AIError("INVALID_AI_CONFIG", { field: name });
    return env[name].trim();
  };
  const key = setting("AI_MUSIC_API_KEY");
  if (!key) throw new AIError("AI_NOT_CONFIGURED", { field: "AI_MUSIC_API_KEY" });
  const models = { "melodia-v3": "v3", v3: "v3", "melodia-v2": "v2", v2: "v2" };
  const model = models[setting("AI_MUSIC_MODEL") || "melodia-v3"];
  const base = setting("AI_MUSIC_BASE_URL");
  if (key.length > 4096 || /[\u0000-\u0020\u007f]/u.test(key) ||
      (base && base.replace(/\/$/, "") !== "https://api.treblo.com/v1") || !Object.values(models).includes(model)) {
    throw new AIError("INVALID_AI_CONFIG");
  }
  const min = setting("AI_MUSIC_MIN_SECONDS"), max = setting("AI_MUSIC_MAX_SECONDS");
  let durationHint = null;
  if (min || max) {
    const low = Number(min), high = Number(max);
    if (model !== "v3" || !/^\d+$/.test(min) || !/^\d+$/.test(max) || low < 0 || low > 270 || high < 30 || high > 300 || low > high || low % 30 || high % 30) {
      throw new AIError("INVALID_AI_CONFIG");
    }
    durationHint = [low, high];
  }

  async function json(path, body) {
    const submitting = body !== undefined;
    try {
      const response = await transport("https://api.treblo.com/v1/" + path, {
        method: submitting ? "POST" : "GET", redirect: "error", cache: "no-store",
        headers: { Authorization: "Bearer " + key, ...(submitting ? { "Content-Type": "application/json" } : {}) },
        body: submitting ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        const known = { 400: "PROVIDER_REQUEST_REJECTED", 401: "PROVIDER_AUTH_ERROR", 402: "MUSIC_CREDITS_REQUIRED", 403: "PROVIDER_AUTH_ERROR", 422: "PROVIDER_REQUEST_REJECTED", 429: "RATE_LIMITED" };
        throw new AIError(known[response.status] ?? (submitting ? "MUSIC_REQUEST_UNKNOWN" : "PROVIDER_UNAVAILABLE"));
      }
      let data;
      try { data = JSON.parse((await boundedBytes(response, 512 * 1024)).toString("utf8")); }
      catch { throw new AIError(submitting ? "MUSIC_REQUEST_UNKNOWN" : "INVALID_PROVIDER_RESPONSE"); }
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new AIError(submitting ? "MUSIC_REQUEST_UNKNOWN" : "INVALID_PROVIDER_RESPONSE");
      return data;
    } catch (error) {
      if (error instanceof AIError) throw error;
      throw new AIError(submitting ? "MUSIC_REQUEST_UNKNOWN" : "PROVIDER_UNAVAILABLE");
    }
  }

  return {
    describe() {
      return { provider: "treblo", requestedModel: model, durationHint: durationHint?.slice() ?? null, musicPromptVersion, ...musicStyle(model) };
    },
    async create({ lyrics }) {
      if (typeof lyrics !== "string" || lyrics.length < 8 || lyrics.length > 4000) throw new AIError("INVALID_AI_INPUT");
      const data = await json("generations/" + model, {
        prompt: musicPrompt, lyrics, instrumental: false,
        ...(model === "v3" ? { negative_tags: musicStyle(model).avoidedStyleTags } : {}),
        ...(durationHint ? { length_range: durationHint } : {}),
        ...(model === "v2" ? { num_songs: 1 } : {}),
        output_format: "mp3", output_bit_rate: 192, align_lyrics: true,
      });
      if (!taskId(data.task_id)) throw new AIError("MUSIC_REQUEST_UNKNOWN");
      return data.task_id;
    },
    async retrieve(id) {
      if (!taskId(id)) throw new AIError("INVALID_AI_INPUT");
      const data = await json("generations/" + id);
      if (typeof data.status !== "string" || !/^[A-Z_]{1,64}$/.test(data.status)) throw new AIError("INVALID_PROVIDER_RESPONSE");
      return data;
    },
    async download(value) {
      let url;
      try { url = new URL(value); } catch { throw new AIError("INVALID_PROVIDER_RESPONSE"); }
      if (url.protocol !== "https:" || url.hostname !== "cdn.treblo.com" || url.port || url.username || url.password || !url.pathname.startsWith("/pubapi/")) {
        throw new AIError("INVALID_PROVIDER_RESPONSE");
      }
      try {
        const response = await transport(url, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(60_000) });
        if (!response.ok || !["audio/mpeg", "audio/mp3", "application/octet-stream"].includes(response.headers.get("content-type")?.split(";")[0].toLowerCase())) {
          await response.body?.cancel(); throw new AIError("INVALID_PROVIDER_RESPONSE");
        }
        const bytes = await boundedBytes(response, maxAudio);
        if (bytes.length < 128 || !(bytes.subarray(0, 3).toString() === "ID3" || (bytes[0] === 255 && (bytes[1] & 224) === 224))) {
          throw new AIError("INVALID_PROVIDER_RESPONSE");
        }
        return bytes;
      } catch (error) {
        if (error instanceof AIError) throw error;
        throw new AIError("PROVIDER_UNAVAILABLE");
      }
    },
  };
}
