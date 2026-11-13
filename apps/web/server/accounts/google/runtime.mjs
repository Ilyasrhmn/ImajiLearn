import { randomUUID } from "node:crypto";
import { database } from "../../core/database.mjs";
import { sessionConfig } from "../../core/config.mjs";
import { errorResponse } from "../../core/errors.mjs";
import { googleConfig, pwaGoogleConfig } from "./config.mjs";
import { createGoogleHandlers } from "./handlers.mjs";

export function googleRoute(name, { pwa = false } = {}) {
  return async request => {
    try {
      const config = { ...sessionConfig(), ...(pwa ? pwaGoogleConfig() : googleConfig()) };
      return await createGoogleHandlers(database(), config)[name](request);
    }
    catch (error) {
      if (name === "callback") {
        const headers = new Headers({ location: `${pwa ? "/app" : ""}/masuk?google=failed`, "cache-control": "no-store", "referrer-policy": "no-referrer" });
        const namespace = pwa ? "pwa_" : "";
        headers.append("set-cookie", `imajilearn_${namespace}google_flow=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
        headers.append("set-cookie", `__Host-imajilearn_${namespace}google_flow=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure`);
        return new Response(null, { status: 303, headers });
      }
      return errorResponse(error, randomUUID());
    }
  };
}
