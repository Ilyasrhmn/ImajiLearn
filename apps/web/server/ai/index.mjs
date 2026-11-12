import "server-only";
import { readFeatureConfig } from "./config.mjs";
import { requestJson } from "./providers/openai-chat.mjs";

export async function generateJson(feature, request) {
  return requestJson(readFeatureConfig(feature), request);
}
