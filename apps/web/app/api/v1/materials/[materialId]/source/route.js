import { createSessionHandlers } from "@/server/accounts/sessions.mjs";
import { sessionConfig } from "@/server/core/config.mjs";
import { database } from "@/server/core/database.mjs";
import { ApiError } from "@/server/core/errors.mjs";
import { endpoint } from "@/server/core/http.mjs";
import { readPdfSourcePage } from "@/server/materials/pdf.mjs";
import { createMaterialService } from "@/server/materials/service.mjs";

export const runtime = "nodejs";

export const GET = (request, context) => endpoint(async () => {
  const db = database();
  const teacher = await createSessionHandlers(db, sessionConfig()).requireTeacher(request);
  const { materialId } = await context.params;
  const page = new URL(request.url).searchParams.get("page") ?? "1";
  if (!/^(?:[1-9]\d?|100)$/.test(page)) throw new ApiError(404, "SOURCE_PAGE_NOT_FOUND", "Halaman sumber tidak ditemukan.");
  const file = await createMaterialService(db).file(teacher.id, materialId);
  if (file.mime !== "application/pdf") throw new ApiError(404, "PDF_NOT_FOUND", "PDF sumber tidak ditemukan.");
  return Response.json({ data: await readPdfSourcePage(file.bytes, Number(page)) });
}, process.env.APP_ORIGIN)(request);
