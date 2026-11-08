import { ApiError } from "../../core/errors.mjs";
import { endpoint, readJson } from "../../core/http.mjs";
import { expectedVersion, etag } from "../../core/version.mjs";
import { WorksheetVersionConflictError } from "./document.mjs";
import { WorksheetValidationError } from "./schema.mjs";
import { createWorksheetService, WorksheetServiceError } from "./service.mjs";

// Covers 30,000 UTF-16 units even when Unicode is escaped, plus the patch envelope.
export const WORKSHEET_PATCH_MAX_BYTES = 256 * 1024;

function apiError(error) {
  if (error instanceof WorksheetValidationError) return new ApiError(422, error.code, error.message, error.fields);
  if (error instanceof WorksheetVersionConflictError) return new ApiError(412, error.code, error.message);
  if (error instanceof WorksheetServiceError && error.code === "WORKSHEET_NOT_FOUND") return new ApiError(404, error.code, error.message);
  if (error instanceof WorksheetServiceError && error.code === "UNAUTHENTICATED") return new ApiError(401, error.code, error.message);
  return error;
}

function version(request) {
  const value = expectedVersion(request);
  if (value < 1) throw new ApiError(400, "INVALID_VERSION", "Versi LKPD harus lebih besar dari nol.");
  return value;
}

function resourceResponse(document) {
  return Response.json({ data: document }, { headers: etag(document.resourceVersion) });
}

function pageQuery(request) {
  const query = new URL(request.url).searchParams;
  for (const key of query.keys()) {
    if (!["limit", "cursor"].includes(key) || query.getAll(key).length !== 1) {
      throw new ApiError(400, "INVALID_QUERY", "Gunakan satu parameter limit atau cursor.");
    }
  }
  const limit = query.get("limit");
  if (limit !== null && (!/^[1-9]\d{0,2}$/.test(limit) || Number(limit) > 100)) {
    throw new WorksheetValidationError("limit", "Batas halaman harus 1–100.");
  }
  return { ...(limit === null ? {} : { limit: Number(limit) }), cursor: query.get("cursor") };
}

export function createWorksheetHandlers({ repository, requireTeacher, origin }) {
  if (typeof requireTeacher !== "function" || typeof repository?.withTeacherTransaction !== "function") {
    throw new TypeError("Worksheet handlers require core authentication and a document repository.");
  }
  const route = action => endpoint(async (current, context) => {
    try {
      // Authenticate before parsing query, body or version. This request-scoped
      // principal comes from core sessions, never from a body or URL parameter.
      const teacher = await requireTeacher(current);
      if (!teacher?.id) throw new ApiError(401, "SESSION_REQUIRED", "Masuk untuk melanjutkan.");
      const service = createWorksheetService({ repository, requireTeacher: async () => teacher });
      return await action(current, context, service);
    } catch (error) { throw apiError(error); }
  }, origin);
  const id = async context => (await context.params).id;
  return Object.freeze({
    list: route(async (request, _context, service) => Response.json(await service.list(request, pageQuery(request)))),
    detail: route(async (request, context, service) => resourceResponse(await service.get(request, await id(context)))),
    update: route(async (request, context, service) => {
      const expected = version(request);
      const patch = await readJson(request, WORKSHEET_PATCH_MAX_BYTES);
      return resourceResponse(await service.update(request, await id(context), patch, expected));
    }),
    remove: route(async (request, context, service) => {
      await service.remove(request, await id(context), version(request));
      return new Response(null, { status: 204 });
    }),
  });
}
