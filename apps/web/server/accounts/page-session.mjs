import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { database } from "../core/database.mjs";
import { sessionConfig } from "../core/config.mjs";
import { ApiError } from "../core/errors.mjs";
import { sessionToken } from "./session-cookie.mjs";
import { createSessionHandlers } from "./sessions.mjs";

export async function requirePageTeacher() {
  const request = { headers: await headers() };
  if (!sessionToken(request, true) && !sessionToken(request, false)) redirect("/masuk");

  const config = sessionConfig();
  try {
    return await createSessionHandlers(database(), config).requireTeacher(request);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect("/masuk");
    throw error;
  }
}
