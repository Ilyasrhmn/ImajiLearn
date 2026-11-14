import { readFeatureConfig } from "./config.mjs";
import { requestJson } from "./providers/openai-chat.mjs";

const recoverable = new Set([
  "PROVIDER_AUTH_ERROR", "RATE_LIMITED", "PROVIDER_UNAVAILABLE", "PROVIDER_TIMEOUT",
  "PROVIDER_REQUEST_REJECTED", "INCOMPLETE_OUTPUT", "INVALID_PROVIDER_RESPONSE", "RESPONSE_TOO_LARGE",
]);

export async function requestTextJson(feature, request, env = process.env, transport = fetch) {
  const primary = readFeatureConfig(feature, env);
  try {
    return await requestJson(primary, request, transport);
  } catch (error) {
    if (!recoverable.has(error.code) || request.signal?.aborted || !env.AI_TEXT_FALLBACK_API_KEY?.trim()) throw error;
    const fallbackEnv = {};
    for (const [key, value] of Object.entries(env)) {
      if (key.startsWith("AI_TEXT_FALLBACK_")) fallbackEnv[`AI_${feature.toUpperCase()}_${key.slice(17)}`] = value;
    }
    const fallback = readFeatureConfig(feature, fallbackEnv);
    console.warn("[ai-provider] Switching to fallback", { feature, code: error.code, model: fallback.model });
    return requestJson(fallback, request, transport);
  }
}
