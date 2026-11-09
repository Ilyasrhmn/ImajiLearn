import { createSessionHandlers } from "../accounts/sessions.mjs";
import { endpoint, readJson } from "../core/http.mjs";
import { etag, expectedVersion } from "../core/version.mjs";
import { createFolderService } from "./service.mjs";

export function createFolderHandlers(db, config) {
  const { requireTeacher } = createSessionHandlers(db, config);
  const folders = createFolderService(db);
  return {
    list: endpoint(async request => {
      const teacher = await requireTeacher(request);
      return Response.json({ data: await folders.list(teacher.id) });
    }, config.origin),
    create: endpoint(async request => {
      const teacher = await requireTeacher(request);
      const data = await folders.create(teacher.id, await readJson(request), request.headers.get("idempotency-key"));
      return Response.json({ data }, { status: 201, headers: etag(data.resourceVersion) });
    }, config.origin),
    rename: endpoint(async (request, id) => {
      const teacher = await requireTeacher(request);
      const data = await folders.rename(teacher.id, id, await readJson(request), expectedVersion(request));
      return Response.json({ data }, { headers: etag(data.resourceVersion) });
    }, config.origin),
    remove: endpoint(async (request, id) => {
      const teacher = await requireTeacher(request);
      await folders.remove(teacher.id, id, expectedVersion(request));
      return new Response(null, { status: 204 });
    }, config.origin),
  };
}
