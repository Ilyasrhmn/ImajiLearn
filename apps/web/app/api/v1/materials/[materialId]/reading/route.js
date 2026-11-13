import { createSessionHandlers } from "@/server/accounts/sessions.mjs";
import { generateJson } from "@/server/ai/index.mjs";
import { sessionConfig } from "@/server/core/config.mjs";
import { database } from "@/server/core/database.mjs";
import { endpoint } from "@/server/core/http.mjs";
import { createMaterialReading } from "@/server/materials/reading.mjs";
import { createPreparedLesson } from "@/server/materials/prepared-lesson.mjs";
import { generateIllustration } from "@/server/ai/providers/lesson-image.mjs";

export const runtime = "nodejs";
export const maxDuration = 300;

const readingRoute = action => (request, context) => endpoint(async () => {
  const config = sessionConfig();
  const db = database();
  const teacher = await createSessionHandlers(db, config).requireTeacher(request);
  const { materialId } = await context.params;
  const data = await createPreparedLesson(db, createMaterialReading(db, generateJson), "reading", generateIllustration, generateJson)[action](teacher.id, materialId);
  return Response.json({ data }, { status: data?.status === "preparing" ? 202 : 200 });
}, process.env.APP_ORIGIN)(request);

export const GET = readingRoute("get");
export const POST = readingRoute("generate");
