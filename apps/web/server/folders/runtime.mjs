import { randomUUID } from "node:crypto";
import { database } from "../core/database.mjs";
import { sessionConfig } from "../core/config.mjs";
import { errorResponse } from "../core/errors.mjs";
import { createFolderHandlers } from "./http.mjs";

export function folderRoute(name) {
  return async (request, context) => {
    try {
      const config = sessionConfig();
      return await createFolderHandlers(database(), config)[name](request, (await context?.params)?.folderId);
    } catch (error) { return errorResponse(error, randomUUID()); }
  };
}
