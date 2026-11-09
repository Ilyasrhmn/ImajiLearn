import { createSessionHandlers } from "../accounts/sessions.mjs";
import { endpoint, readJson } from "../core/http.mjs";
import { etag, expectedVersion } from "../core/version.mjs";
import { createScheduleService, parseScheduleQuery } from "./service.mjs";

export function createScheduleHandlers(db, config) {
  const { requireTeacher } = createSessionHandlers(db, config);
  const schedule = createScheduleService(db);
  return {
    get: endpoint(async request => {
      const teacher = await requireTeacher(request);
      const data = await schedule.get(teacher.id, parseScheduleQuery(new URL(request.url).searchParams));
      return Response.json({ data }, { headers: etag(data.resourceVersion) });
    }, config.origin),
    create: endpoint(async request => {
      const teacher = await requireTeacher(request);
      const data = await schedule.create(teacher.id, await readJson(request), request.headers.get("idempotency-key"));
      return Response.json({ data }, { status: 201 });
    }, config.origin),
    update: endpoint(async (request, id) => {
      const teacher = await requireTeacher(request);
      const data = await schedule.update(teacher.id, id, await readJson(request), expectedVersion(request));
      return Response.json({ data }, { headers: etag(data.resourceVersion) });
    }, config.origin),
    remove: endpoint(async (request, id) => {
      const teacher = await requireTeacher(request);
      await schedule.remove(teacher.id, id, expectedVersion(request));
      return new Response(null, { status: 204 });
    }, config.origin),
  };
}
