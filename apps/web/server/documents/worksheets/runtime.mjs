import { randomUUID } from "node:crypto";
import { database } from "../../core/database.mjs";
import { sessionConfig } from "../../core/config.mjs";
import { errorResponse } from "../../core/errors.mjs";
import { createSessionHandlers } from "../../accounts/sessions.mjs";
import { createWorksheetDocumentRepository } from "./repository.mjs";
import { createWorksheetHandlers } from "./http.mjs";

export function worksheetRoute(name) {
  return async (request, context) => {
    try {
      const config = sessionConfig();
      const db = database();
      const { requireTeacher } = createSessionHandlers(db, config);
      const repository = createWorksheetDocumentRepository({ database: db });
      return await createWorksheetHandlers({ repository, requireTeacher, origin: config.origin })[name](request, context);
    } catch (error) { return errorResponse(error, randomUUID()); }
  };
}
