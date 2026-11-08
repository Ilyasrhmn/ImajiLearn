import { randomUUID } from "node:crypto";
import { database } from "../../core/database.mjs";
import { sessionConfig } from "../../core/config.mjs";
import { errorResponse } from "../../core/errors.mjs";
import { createMediaPreferenceHandlers } from "./http.mjs";

export function mediaPreferenceRoute(name) {
  return async (request, context) => {
    try {
      const config = sessionConfig();
      return await createMediaPreferenceHandlers(database(), config)[name](request, (await context?.params)?.materialId);
    } catch (error) { return errorResponse(error, randomUUID()); }
  };
}
