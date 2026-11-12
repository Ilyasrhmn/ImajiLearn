import { createSessionHandlers } from "@/server/accounts/sessions.mjs";
import { sessionConfig } from "@/server/core/config.mjs";
import { database } from "@/server/core/database.mjs";
import { endpoint } from "@/server/core/http.mjs";
import { createSlideIllustrations } from "@/server/materials/slide-illustrations.mjs";

import { illustrationMime, parseLessonIndex } from "@/server/materials/lesson-illustration.mjs";

export const runtime = "nodejs";

export const GET = (request, context) => endpoint(async () => {
  const config = sessionConfig(), db = database();
  const teacher = await createSessionHandlers(db, config).requireTeacher(request);
  const { materialId, index } = await context.params;
  const query = new URL(request.url).searchParams;
  const mode = query.get("view");
  const result = await createSlideIllustrations(db).get(
    teacher.id, materialId, query.get("revision"), parseLessonIndex(index), mode,
  );
  if (mode === "status") return Response.json({ data: result });
  const image = result;
  if (!image) return new Response(null, { status: 204 });
  return new Response(image, { headers: { "content-type": illustrationMime(image), "x-content-type-options": "nosniff" } });
}, process.env.APP_ORIGIN)(request);
