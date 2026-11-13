import { ApiError } from "../core/errors.mjs";
import { canonicalMaterialId, getOwnedMaterial } from "./readers.mjs";
import { scanMediaHistory } from "./media-history.mjs";
import { sectionLabel } from "../../lib/material-section-label.mjs";

const missing = () => new ApiError(404, "MATERIAL_NOT_FOUND", "Materi tidak ditemukan.");
const features = ["reading", "slides", "song", "mindmap"];
function requireFeature(feature) {
  if (!features.includes(feature)) throw new ApiError(422, "INVALID_MEDIA_FEATURE", "Jenis media tidak valid.");
}

export async function saveMediaDraft(db, userId, materialId, feature) {
  requireFeature(feature);
  const id = canonicalMaterialId(materialId);
  if (!id) throw missing();
  return db.$transaction(async tx => {
    const source = await getOwnedMaterial(tx, userId, id);
    if (!source) throw missing();
    const rootId = source.parentId ?? source.id;
    const root = rootId === id ? source : await tx.material.findFirst({ where: { id: rootId, userId } });
    if (!root) throw missing();
    if (source.archived || root.archived) throw new ApiError(409, "MATERIAL_ARCHIVED", "Pulihkan materi untuk membuat media.");
    await tx.mediaDraft.upsert({ where: { rootId_feature: { rootId, feature } }, create: { rootId, feature, userId, selectionId: id },
      update: { selectionId: id } });
    return { materialId: id, rootId };
  });
}

export async function finishMediaDraft(db, userId, materialId, feature) {
  requireFeature(feature);
  const id = canonicalMaterialId(materialId);
  const source = id && await db.material.findFirst({ where: { id, userId }, select: { id: true } });
  if (!source) throw missing();
  await db.mediaDraft.deleteMany({ where: { userId, feature, selectionId: id } });
}

export async function mediaLibrary(db, userId, feature, params) {
  requireFeature(feature);
  const tab = params.get("tab") ?? "history";
  const requestedPage = Number(params.get("page") ?? 1);
  const query = (params.get("q") ?? "").trim().toLocaleLowerCase("id");
  if (!["drafts", "history"].includes(tab) || !Number.isSafeInteger(requestedPage) || requestedPage < 1 || requestedPage > 10000 || query.length > 200) {
    throw new ApiError(422, "INVALID_MEDIA_LIBRARY", "Daftar media tidak valid.");
  }
  const counts = { drafts: 0, history: 0 };
  let total = 0, items = [], lastPage = [];
  const collect = (item, category) => {
    counts[category]++;
    if (category !== tab || (query && ![item.title, item.sourceTitle, item.sourceName, item.folderName]
      .some(text => text?.toLocaleLowerCase("id").includes(query)))) return;
    if (total % 10 === 0) lastPage = [];
    lastPage.push(item);
    if (Math.floor(total / 10) === requestedPage - 1) items.push(item);
    total++;
  };
  let cursor = null;
  do {
    const saved = await db.mediaDraft.findMany({
      where: { userId, feature, root: { archived: false }, selection: { archived: false },
        ...(cursor ? { OR: [{ updatedAt: { lt: cursor.updatedAt } }, { updatedAt: cursor.updatedAt, rootId: { lt: cursor.rootId } }] } : {}),
      }, orderBy: [{ updatedAt: "desc" }, { rootId: "desc" }], take: 100,
      select: { rootId: true, updatedAt: true, selection: { select: { id: true, title: true, pageStart: true, pageEnd: true, sectionPages: true } },
        root: { select: { title: true, file: { select: { name: true, mime: true } }, folder: { select: { name: true } } } } },
    });
    const generated = new Map();
    if (saved.length) for await (const { item } of scanMediaHistory(db, userId, feature, { materialIds: saved.map(draft => draft.selection.id) })) {
      generated.set(item.materialId, item);
    }
    for (const { selection, root, updatedAt } of saved) {
      const existing = generated.get(selection.id);
      if (existing?.status === "ready") continue;
      collect({ ...(existing ?? { materialId: selection.id, title: sectionLabel(selection.title === "Pilihan halaman" ? root.title : selection.title), status: "draft",
        first: selection.pageStart, last: selection.pageEnd, pages: selection.sectionPages,
        generatedAt: null, sourceTitle: root.title, sourceName: root.file?.name ?? null,
        sourceMime: root.file?.mime ?? null, folderName: root.folder?.name ?? null }), updatedAt: updatedAt.toISOString() }, "drafts");
    }
    cursor = saved.length === 100 ? saved.at(-1) : null;
  } while (cursor);
  for await (const { item, saved } of scanMediaHistory(db, userId, feature)) {
    if (item.status === "ready") collect(item, "history");
    else if (!saved) collect(item, "drafts");
  }
  const pages = Math.max(1, Math.ceil(total / 10));
  const page = Math.min(requestedPage, pages);
  if (page !== requestedPage) items = lastPage;
  return { items, total, page, pages, counts };
}
