import { createSessionHandlers } from "@/server/accounts/sessions.mjs";
import { sessionConfig } from "@/server/core/config.mjs";
import { database } from "@/server/core/database.mjs";
import { endpoint } from "@/server/core/http.mjs";
import { mediaLibrary } from "@/server/materials/media-library.mjs";

export const runtime = "nodejs";

export const GET = request => endpoint(async () => {
  const db = database();
  const teacher = await createSessionHandlers(db, sessionConfig()).requireTeacher(request);
  const params = new URL(request.url).searchParams;
  return Response.json({ data: await mediaLibrary(db, teacher.id, "reading", params) });
}, process.env.APP_ORIGIN)(request);
