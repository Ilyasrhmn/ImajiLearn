import { randomUUID } from "node:crypto";
import { database } from "../core/database.mjs";
import { sessionConfig } from "../core/config.mjs";
import { errorResponse } from "../core/errors.mjs";
import { createMaterialHandlers } from "./http.mjs";

export function materialRoute(name) {
  return async (request, context) => {
    try {
      const config = sessionConfig();
      return await createMaterialHandlers(database(), config)[name](request, (await context?.params)?.materialId);
    } catch (error) { return errorResponse(error, randomUUID()); }
  };
}
