import { generateJson } from "@/server/ai/index.mjs";
import { createSessionHandlers } from "@/server/accounts/sessions.mjs";
import { generateIllustration } from "@/server/ai/providers/kie-image.mjs";
import { sessionConfig } from "@/server/core/config.mjs";
import { database } from "@/server/core/database.mjs";
import { endpoint } from "@/server/core/http.mjs";
import { createReadingIllustration } from "@/server/materials/reading-illustration.mjs";

import { illustrationMime, parseLessonIndex } from "@/server/materials/lesson-illustration.mjs";

export const runtime = "nodejs";

const illustrationRoute = action => (request, context) => endpoint(async () => {
  const config = sessionConfig();
  const db = database();
  const teacher = await createSessionHandlers(db, config).requireTeacher(request);
  const { materialId } = await context.params;
  const query = new URL(request.url).searchParams;
  const section = query.get("section");
  const index = section === null ? undefined : parseLessonIndex(section);
  const service = createReadingIllustration(db, generateIllustration, generateJson);
  const mode = query.get("view");
  if (action === "get" && mode === "status") {
    return Response.json({ data: await service.get(teacher.id, materialId, index, mode) });
  }
  const image = action === "get"
    ? await service.get(teacher.id, materialId, index, mode)
    : await service.generate(teacher.id, materialId, query.get("replace") === "1", index);
  if (mode === "status") return Response.json({ data: await service.get(teacher.id, materialId, index, mode) });
  if (!image) return new Response(null, { status: 204 });
  return new Response(image, { headers: { "content-type": illustrationMime(image), "x-content-type-options": "nosniff" } });
}, process.env.APP_ORIGIN)(request);

export const GET = illustrationRoute("get");
export const POST = illustrationRoute("generate");
