import { randomUUID } from "node:crypto";
import { database } from "../../core/database.mjs";
import { sessionConfig } from "../../core/config.mjs";
import { errorResponse } from "../../core/errors.mjs";
import { createMediaPreferenceHandlers } from "./http.mjs";

export function mediaPreferenceRoute(name) {
  return async request => {
    try {
      const config = sessionConfig();
      return await createMediaPreferenceHandlers(database(), config)[name](request);
    } catch (error) { return errorResponse(error, randomUUID()); }
  };
}
