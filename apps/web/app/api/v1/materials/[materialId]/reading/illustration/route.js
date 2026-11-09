import { createSessionHandlers } from "@/server/accounts/sessions.mjs";
import { generateIllustration } from "@/server/ai/providers/cloudflare-image.mjs";
import { sessionConfig } from "@/server/core/config.mjs";
import { database } from "@/server/core/database.mjs";
import { endpoint } from "@/server/core/http.mjs";
import { createReadingIllustration } from "@/server/materials/reading-illustration.mjs";

export const runtime = "nodejs";

const illustrationRoute = action => (request, context) => endpoint(async () => {
  const config = sessionConfig();
  const db = database();
  const teacher = await createSessionHandlers(db, config).requireTeacher(request);
  const { materialId } = await context.params;
  const image = await createReadingIllustration(db, generateIllustration)[action](teacher.id, materialId);
  if (!image) return new Response(null, { status: 204 });
  return new Response(image, { headers: { "content-type": "image/jpeg", "x-content-type-options": "nosniff" } });
}, process.env.APP_ORIGIN)(request);

export const GET = illustrationRoute("get");
export const POST = illustrationRoute("generate");
