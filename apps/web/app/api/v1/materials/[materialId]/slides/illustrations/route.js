import { generateJson } from "@/server/ai/index.mjs";
import { createSessionHandlers } from "@/server/accounts/sessions.mjs";
import { generateIllustration } from "@/server/ai/providers/lesson-image.mjs";
import { sessionConfig } from "@/server/core/config.mjs";
import { database } from "@/server/core/database.mjs";
import { endpoint, readJson } from "@/server/core/http.mjs";
import { createSlideIllustrations } from "@/server/materials/slide-illustrations.mjs";

export const runtime = "nodejs";

export const POST = (request, context) => endpoint(async () => {
  const config = sessionConfig(), db = database();
  const teacher = await createSessionHandlers(db, config).requireTeacher(request);
  const { materialId } = await context.params;
  const revision = new URL(request.url).searchParams.get("revision");
  const illustrations = createSlideIllustrations(db, generateIllustration, generateJson);
  const body = await readJson(request, 1024);
  await illustrations.generate(teacher.id, materialId, revision, body?.index, body?.replace === true);
  return Response.json({ data: { index: body.index } });
}, process.env.APP_ORIGIN)(request);
