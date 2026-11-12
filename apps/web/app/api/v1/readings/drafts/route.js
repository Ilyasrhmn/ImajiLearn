import { createSessionHandlers } from "@/server/accounts/sessions.mjs";
import { sessionConfig } from "@/server/core/config.mjs";
import { database } from "@/server/core/database.mjs";
import { endpoint, readJson } from "@/server/core/http.mjs";
import { saveMediaDraft, finishMediaDraft } from "@/server/materials/media-library.mjs";

export const runtime = "nodejs";

function route(finish) {
  return request => endpoint(async () => {
    const db = database();
    const teacher = await createSessionHandlers(db, sessionConfig()).requireTeacher(request);
    const body = await readJson(request, 1024);
    if (finish) {
      await finishMediaDraft(db, teacher.id, body?.materialId, "reading");
      return new Response(null, { status: 204 });
    }
    return Response.json({ data: await saveMediaDraft(db, teacher.id, body?.materialId, "reading") });
  }, process.env.APP_ORIGIN)(request);
}

export const PUT = route(false);
export const DELETE = route(true);
