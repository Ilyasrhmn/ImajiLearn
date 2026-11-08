import { randomUUID } from "node:crypto";
import { database } from "../core/database.mjs";
import { registrationConfig, sessionConfig } from "../core/config.mjs";
import { errorResponse } from "../core/errors.mjs";
import { createRegistrationHandler } from "./registration.mjs";
import { createSessionHandlers } from "./sessions.mjs";

export async function registrationRoute(request) {
  try {
    const config = registrationConfig();
    return await createRegistrationHandler(database(), config)(request);
  } catch (error) { return errorResponse(error, randomUUID()); }
}

export function sessionRoute(name) {
  return async request => {
    try {
      const config = sessionConfig();
      return await createSessionHandlers(database(), config)[name](request);
    } catch (error) { return errorResponse(error, randomUUID()); }
  };
}
