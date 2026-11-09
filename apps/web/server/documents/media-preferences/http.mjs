import { ContractError } from "../../../../../packages/contracts/validation.mjs";
import { parseMaterialIds } from "../../../../../packages/contracts/media-preferences.mjs";
import { endpoint, readJson } from "../../core/http.mjs";
import { expectedVersion, etag } from "../../core/version.mjs";
import { createSessionHandlers } from "../../accounts/sessions.mjs";
import { createMediaPreferenceStore } from "./store.mjs";

export function createMediaPreferenceHandlers(database, config) {
  const { requireTeacher } = createSessionHandlers(database, config);
  const store = createMediaPreferenceStore(database);
  return {
    put: endpoint(async (request, materialId) => {
      const teacher = await requireTeacher(request);
      const body = await readJson(request, 4 * 1024);
      const data = await store.save(teacher.id, materialId, body, expectedVersion(request));
      return Response.json({ data }, { headers: etag(data.resourceVersion) });
    }, config.origin),
    list: endpoint(async request => {
      const teacher = await requireTeacher(request);
      const params = new URL(request.url).searchParams;
      if (params.getAll("materialIds").length !== 1 || [...params.keys()].some(key => key !== "materialIds")) {
        throw new ContractError("Kirim satu parameter materialIds.");
      }
      const data = await store.list(teacher.id, parseMaterialIds(params.get("materialIds")));
      return Response.json({ data, page: { nextCursor: null } });
    }, config.origin),
  };
}
