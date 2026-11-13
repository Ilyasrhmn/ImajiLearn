import "server-only";
import { readFeatureConfig } from "./config.mjs";
import { requestJson } from "./providers/openai-chat.mjs";
import { repairAIRequest } from "./repair-context.mjs";

export async function generateJson(feature, request) {
  return requestJson(readFeatureConfig(feature), repairAIRequest(request));
}
