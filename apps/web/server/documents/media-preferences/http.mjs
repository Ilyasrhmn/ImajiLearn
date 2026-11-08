import { ContractError } from "../../../../../packages/contracts/validation.mjs";
import { parseMaterialIds } from "../../../../../packages/contracts/media-preferences.mjs";
import { endpoint } from "../../core/http.mjs";
import { createSessionHandlers } from "../../accounts/sessions.mjs";
import { createMediaPreferenceStore } from "./store.mjs";

export function createMediaPreferenceHandlers(database, config) {
  const { requireTeacher } = createSessionHandlers(database, config);
  const store = createMediaPreferenceStore(database);
  return {
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
