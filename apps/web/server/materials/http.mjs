import { endpoint, readJson } from "../core/http.mjs";
import { expectedVersion, etag } from "../core/version.mjs";
import { createSessionHandlers } from "../accounts/sessions.mjs";
import { createMaterialService } from "./service.mjs";
import { readMaterialUpload } from "./upload.mjs";

export function createMaterialHandlers(db, config) {
  const { requireTeacher } = createSessionHandlers(db, config), materials = createMaterialService(db);
  return {
    list: endpoint(async request => {
      const teacher = await requireTeacher(request);
      return Response.json(await materials.list(teacher.id, new URL(request.url).searchParams));
    }, config.origin),
    create: endpoint(async request => {
      const teacher = await requireTeacher(request);
      const { body, file } = await readMaterialUpload(request);
      const data = await materials.create(teacher.id, body, request.headers.get("idempotency-key"), file);
      return Response.json({ data }, { status: 201, headers: etag(data.resourceVersion) });
    }, config.origin),
    get: endpoint(async (request, id) => {
      const teacher = await requireTeacher(request), data = await materials.get(teacher.id, id);
      return Response.json({ data }, { headers: etag(data.resourceVersion) });
    }, config.origin),
    file: endpoint(async (request, id) => {
      const teacher = await requireTeacher(request);
      const file = await materials.file(teacher.id, id);
      const filename = encodeURIComponent(file.name).replace(/['()*]/g, character => "%" + character.charCodeAt(0).toString(16));
      return new Response(file.bytes, { headers: {
        "content-type": file.mime, "content-length": String(file.size), "x-content-type-options": "nosniff",
        "content-disposition": `attachment; filename*=UTF-8''${filename}`,
      } });
    }, config.origin),
    patch: endpoint(async (request, id) => {
      const teacher = await requireTeacher(request);
      const data = await materials.patch(teacher.id, id, await readJson(request), expectedVersion(request));
      return Response.json({ data }, { headers: etag(data.resourceVersion) });
    }, config.origin),
    remove: endpoint(async (request, id) => {
      const teacher = await requireTeacher(request);
      await materials.remove(teacher.id, id, expectedVersion(request));
      return new Response(null, { status: 204 });
    }, config.origin),
  };
}
