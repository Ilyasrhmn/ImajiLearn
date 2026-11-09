import { endpoint, readJson } from "../core/http.mjs";
import { expectedVersion, etag } from "../core/version.mjs";
import { createSessionHandlers } from "../accounts/sessions.mjs";
import { createExamService } from "./service.mjs";

const result = (data, status = 200) => Response.json({ data }, { status, headers: etag(data.resourceVersion) });

export function createExamHandlers(db, config) {
  const { requireTeacher } = createSessionHandlers(db, config);
  const exams = createExamService(db);
  return {
    create: endpoint(async request => {
      const teacher = await requireTeacher(request);
      return result(await exams.create(teacher, await readJson(request, 128 * 1024), request.headers.get("idempotency-key")), 201);
    }, config.origin),
    list: endpoint(async request => {
      const teacher = await requireTeacher(request);
      const data = await exams.list(teacher.id, new URL(request.url).searchParams);
      return Response.json({ data, page: { nextCursor: null } });
    }, config.origin),
    get: endpoint(async (request, id) => {
      const teacher = await requireTeacher(request);
      return result(await exams.get(teacher.id, id));
    }, config.origin),
    patch: endpoint(async (request, id) => {
      const teacher = await requireTeacher(request);
      return result(await exams.patch(teacher.id, id, await readJson(request, 4 * 1024 * 1024), expectedVersion(request)));
    }, config.origin),
    remove: endpoint(async (request, id) => {
      const teacher = await requireTeacher(request);
      await exams.remove(teacher.id, id, expectedVersion(request));
      return new Response(null, { status: 204 });
    }, config.origin),
  };
}
