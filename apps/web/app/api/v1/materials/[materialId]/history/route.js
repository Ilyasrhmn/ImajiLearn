import { createSessionHandlers } from "@/server/accounts/sessions.mjs";
import { sessionConfig } from "@/server/core/config.mjs";
import { database } from "@/server/core/database.mjs";
import { endpoint } from "@/server/core/http.mjs";
import { materialMediaHistory } from "@/server/materials/media-history.mjs";

export const runtime = "nodejs";

export const GET = (request, context) => endpoint(async () => {
  const db = database();
  const teacher = await createSessionHandlers(db, sessionConfig()).requireTeacher(request);
  const { materialId } = await context.params;
  const data = await materialMediaHistory(db, teacher.id, materialId, new URL(request.url).searchParams);
  return Response.json({ data });
}, process.env.APP_ORIGIN)(request);
