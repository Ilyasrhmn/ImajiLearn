import { randomUUID } from "node:crypto";
import { database } from "../../core/database.mjs";
import { sessionConfig } from "../../core/config.mjs";
import { errorResponse } from "../../core/errors.mjs";
import { googleConfig } from "./config.mjs";
import { createGoogleHandlers } from "./handlers.mjs";

export function googleRoute(name) {
  return async request => {
    try {
      const config = { ...googleConfig(), ...sessionConfig() };
      return await createGoogleHandlers(database(), config)[name](request);
    }
    catch (error) {
      if (name === "callback") {
        const headers = new Headers({ location: "/masuk?google=failed", "cache-control": "no-store", "referrer-policy": "no-referrer" });
        headers.append("set-cookie", "imajilearn_google_flow=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
        headers.append("set-cookie", "__Host-imajilearn_google_flow=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure");
        return new Response(null, { status: 303, headers });
      }
      return errorResponse(error, randomUUID());
    }
  };
}
