import { studioRequest } from "./studio-api.mjs";

export const NO_SUBJECT_LABEL = "Tanpa mata pelajaran";

const materialPath = id => `/materials/${encodeURIComponent(id)}`;
const folderPath = id => `/folders/${encodeURIComponent(id)}`;
const adapt = row => ({ ...row, createdAt: Date.parse(row.createdAt) });

export async function listMaterials(teacherId) {
  const items = [];
  let cursor;
  do {
    const query = new URLSearchParams({ view: "all", limit: "100" });
    if (cursor) query.set("cursor", cursor);
    const { data, page } = await studioRequest(teacherId, `/materials?${query}`);
    if (data.length) {
      const ids = data.map(item => item.id).join(",");
      const { data: preferences } = await studioRequest(teacherId, `/media-preferences?materialIds=${ids}`);
      const byId = new Map(preferences.map(preference => [preference.materialId, preference]));
      for (const row of data) {
        const { selectedMedia, songTemplateId, resourceVersion: preferenceVersion } = byId.get(row.id);
        items.push({ ...adapt(row), selectedMedia, songTemplateId, preferenceVersion });
      }
    }
    cursor = page.nextCursor;
  } while (cursor);
  return items;
}

export async function getMaterial(teacherId, id) {
  return adapt((await studioRequest(teacherId, materialPath(id))).data);
}

export function downloadMaterial(teacherId, id) {
  return studioRequest(teacherId, `${materialPath(id)}/file`, { binary: true });
}

export async function saveMaterial(teacherId, material, key) {
  const body = new FormData();
  body.set("title", material.title);
  body.set("text", material.text);
  if (material.folderId) body.set("folderId", material.folderId);
  if (material.file) body.set("file", material.file);
  return adapt((await studioRequest(teacherId, "/materials", { method: "POST", body, key })).data);
}

export async function updateMaterial(teacherId, material, changes) {
  const body = Object.hasOwn(changes, "folderId") ? { ...changes, folderId: changes.folderId || null } : changes;
  const { data } = await studioRequest(teacherId, materialPath(material.id), { method: "PATCH", body, version: material.resourceVersion });
  return { ...material, ...adapt(data) };
}

export const deleteMaterial = (teacherId, material) =>
  studioRequest(teacherId, materialPath(material.id), { method: "DELETE", version: material.resourceVersion });

export async function listFolders(teacherId) {
  return (await studioRequest(teacherId, "/folders")).data;
}

export async function changeFolder(teacherId, { id, name, remove = false, resourceVersion, key }) {
  if (remove) return studioRequest(teacherId, folderPath(id), { method: "DELETE", version: resourceVersion });
  const { data } = await studioRequest(teacherId, id ? folderPath(id) : "/folders",
    { method: id ? "PATCH" : "POST", body: { name }, version: resourceVersion, key });
  return data;
}
