import { createSessionHandlers } from "@/server/accounts/sessions.mjs";
import { sessionConfig } from "@/server/core/config.mjs";
import { database } from "@/server/core/database.mjs";
import { endpoint } from "@/server/core/http.mjs";
import { createSlideIllustrations } from "@/server/materials/slide-illustrations.mjs";

export const runtime = "nodejs";

export const GET = (request, context) => endpoint(async () => {
  const config = sessionConfig(), db = database();
  const teacher = await createSessionHandlers(db, config).requireTeacher(request);
  const { materialId, index } = await context.params;
  const revision = new URL(request.url).searchParams.get("revision");
  const image = await createSlideIllustrations(db).get(teacher.id, materialId, revision, /^[0-5]$/.test(index) ? Number(index) : NaN);
  if (!image) return new Response(null, { status: 204 });
  return new Response(image, { headers: { "content-type": "image/jpeg", "x-content-type-options": "nosniff" } });
}, process.env.APP_ORIGIN)(request);
