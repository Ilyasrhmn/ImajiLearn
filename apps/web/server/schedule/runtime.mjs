import { randomUUID } from "node:crypto";
import { database } from "../core/database.mjs";
import { sessionConfig } from "../core/config.mjs";
import { errorResponse } from "../core/errors.mjs";
import { createScheduleHandlers } from "./http.mjs";

export function scheduleRoute(name) {
  return async (request, context) => {
    try {
      return await createScheduleHandlers(database(), sessionConfig())[name](request, (await context?.params)?.slotId);
    } catch (error) { return errorResponse(error, randomUUID()); }
  };
}
