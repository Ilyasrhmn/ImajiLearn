import { createSessionHandlers } from "@/server/accounts/sessions.mjs";
import { generateJson } from "@/server/ai/index.mjs";
import { sessionConfig } from "@/server/core/config.mjs";
import { database } from "@/server/core/database.mjs";
import { endpoint } from "@/server/core/http.mjs";
import { etag, expectedVersion } from "@/server/core/version.mjs";
import { createExamGeneration } from "@/server/exams/generation.mjs";

export const runtime = "nodejs";
export const maxDuration = 300;

export const POST = (request, context) => endpoint(async () => {
  const config = sessionConfig(), db = database();
  const teacher = await createSessionHandlers(db, config).requireTeacher(request);
  const { id } = await context.params;
  const data = await createExamGeneration(db, generateJson).fill(teacher.id, id, expectedVersion(request), request.signal);
  return Response.json({ data }, { headers: etag(data.resourceVersion) });
}, process.env.APP_ORIGIN)(request);
