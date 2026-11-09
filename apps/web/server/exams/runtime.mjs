import { randomUUID } from "node:crypto";
import { database } from "../core/database.mjs";
import { sessionConfig } from "../core/config.mjs";
import { errorResponse } from "../core/errors.mjs";
import { createExamHandlers } from "./http.mjs";

export function examRoute(name) {
  return async (request, context) => {
    try {
      return await createExamHandlers(database(), sessionConfig())[name](request, (await context?.params)?.id);
    } catch (error) { return errorResponse(error, randomUUID()); }
  };
}
