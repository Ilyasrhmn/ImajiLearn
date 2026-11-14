import "server-only";
import { requestTextJson } from "./text-provider.mjs";
import { repairAIRequest } from "./repair-context.mjs";

export async function generateJson(feature, request) {
  return requestTextJson(feature, repairAIRequest(request));
}
