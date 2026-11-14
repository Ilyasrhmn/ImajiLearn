import { AIError } from "./errors.mjs";

const features = ["reading", "mindmap", "slides", "song", "exam", "music"];

function invalid(field) {
  throw new AIError("INVALID_AI_CONFIG", { field });
}

function setting(env, prefix, key, fallback = "") {
  const value = env[`${prefix}${key}`];
  if (value === undefined) return fallback;
  if (typeof value !== "string") invalid(`${prefix}${key}`);
  return value.trim() || fallback;
}

function number(env, prefix, key, fallback, min, max, integer = true) {
  const raw = setting(env, prefix, key);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!/^(\d+\.?\d*|\.\d+)$/.test(raw) || !Number.isFinite(value) || value < min || value > max ||
    (integer && !Number.isSafeInteger(value))) invalid(`${prefix}${key}`);
  return value;
}

function choice(env, prefix, key, allowed, fallback) {
  const value = setting(env, prefix, key, fallback);
  if (!allowed.includes(value)) invalid(`${prefix}${key}`);
  return value;
}

export function readFeatureConfig(feature, env = process.env) {
  if (!features.includes(feature)) throw new AIError("INVALID_AI_FEATURE");
  const prefix = `AI_${feature.toUpperCase()}_`;
  const base = setting(env, prefix, "BASE_URL");
  const apiKey = setting(env, prefix, "API_KEY");
  const model = setting(env, prefix, "MODEL");
  if (!base || !apiKey || !model) throw new AIError("AI_NOT_CONFIGURED", { field: prefix });
  for (const [key, max] of [["API_KEY", 4096], ["MODEL", 200], ["BASE_URL", 2000]]) {
    if (env[`${prefix}${key}`].length > max || /[\u0000-\u001f\u007f\\]/u.test(env[`${prefix}${key}`])) invalid(`${prefix}${key}`);
  }
  let url;
  try { url = new URL(base); } catch { invalid(`${prefix}BASE_URL`); }
  const localHttp = url.protocol === "http:" && env.NODE_ENV !== "production" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !localHttp) || url.username || url.password || url.search || url.hash ||
    /\/chat\/completions\/?$/.test(url.pathname)) invalid(`${prefix}BASE_URL`);
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  const audio = feature === "music";
  const config = {
    feature, kind: audio ? "audio" : "text", baseUrl: url.href, model,
    timeoutMs: number(env, prefix, "TIMEOUT_MS", 120000, 1000, 120000),
  };
  if (!audio) {
    Object.assign(config, {
      protocol: choice(env, prefix, "PROTOCOL", ["openai-chat", "openai-responses"], "openai-chat"),
      maxOutputTokens: number(env, prefix, "MAX_OUTPUT_TOKENS", feature === "song" ? 2048 : feature === "mindmap" ? 3072 : 4096, 1, 8192),
      tokenLimitField: choice(env, prefix, "TOKEN_LIMIT_FIELD", ["max_completion_tokens", "max_tokens"], "max_completion_tokens"),
      responseFormat: choice(env, prefix, "RESPONSE_FORMAT", ["json_object", "json_schema"], "json_object"),
      temperature: number(env, prefix, "TEMPERATURE", undefined, 0, 2, false),
      reasoningEffort: choice(env, prefix, "REASONING_EFFORT", ["", "none", "minimal", "low", "medium", "high", "xhigh", "max"], "") || undefined,
    });
  }
  Object.defineProperty(config, "apiKey", { value: apiKey, enumerable: false });
  return Object.freeze(config);
}
