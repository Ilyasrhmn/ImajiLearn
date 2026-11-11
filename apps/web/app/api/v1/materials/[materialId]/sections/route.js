import { createSessionHandlers } from "@/server/accounts/sessions.mjs";
import { sessionConfig } from "@/server/core/config.mjs";
import { database } from "@/server/core/database.mjs";
import { endpoint } from "@/server/core/http.mjs";
import { materialSections } from "@/server/materials/sections.mjs";

export const runtime = "nodejs";

function route(method) {
  return (request, context) => endpoint(async () => {
    const db = database();
    const { id } = await createSessionHandlers(db, sessionConfig()).requireTeacher(request);
    const { materialId } = await context.params;
    const data = await materialSections(db, id, materialId, method === "POST" ? new URL(request.url).searchParams : null);
    return Response.json({ data });
  }, process.env.APP_ORIGIN)(request);
}

export const GET = route("GET");
export const POST = route("POST");
