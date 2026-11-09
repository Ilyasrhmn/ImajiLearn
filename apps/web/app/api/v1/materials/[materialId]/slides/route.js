import { createSessionHandlers } from "@/server/accounts/sessions.mjs";
import { generateJson } from "@/server/ai/index.mjs";
import { sessionConfig } from "@/server/core/config.mjs";
import { database } from "@/server/core/database.mjs";
import { endpoint } from "@/server/core/http.mjs";
import { createMaterialSlides } from "@/server/materials/slides.mjs";

export const runtime = "nodejs";

const slidesRoute = action => (request, context) => endpoint(async () => {
  const config = sessionConfig();
  const db = database();
  const teacher = await createSessionHandlers(db, config).requireTeacher(request);
  const { materialId } = await context.params;
  const data = await createMaterialSlides(db, generateJson)[action](teacher.id, materialId);
  return Response.json({ data });
}, process.env.APP_ORIGIN)(request);

export const GET = slidesRoute("get");
export const POST = slidesRoute("generate");
