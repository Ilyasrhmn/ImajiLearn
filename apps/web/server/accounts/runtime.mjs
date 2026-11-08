import { randomUUID } from "node:crypto";
import { database } from "../core/database.mjs";
import { registrationConfig } from "../core/config.mjs";
import { errorResponse } from "../core/errors.mjs";
import { createRegistrationHandler } from "./registration.mjs";

export async function registrationRoute(request) {
  try {
    const config = registrationConfig();
    return await createRegistrationHandler(database(), config)(request);
  } catch (error) { return errorResponse(error, randomUUID()); }
}
