import { ApiError } from "../core/errors.mjs";
import { canonicalMaterialId, getOwnedMaterial } from "./readers.mjs";
import { materialMediaHistory } from "./media-history.mjs";
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
  const [history, saved] = await Promise.all([
    materialMediaHistory(db, userId, null, new URLSearchParams({ feature }), { all: true }),
    db.mediaDraft.findMany({ where: { userId, feature, root: { archived: false }, selection: { archived: false } },
      orderBy: [{ updatedAt: "desc" }, { rootId: "desc" }],
      select: { updatedAt: true, selection: { select: { id: true, title: true, pageStart: true, pageEnd: true, sectionPages: true } },
        root: { select: { title: true, file: { select: { name: true, mime: true } }, folder: { select: { name: true } } } } } }),
  ]);
  const ready = history.items.filter(item => item.status === "ready");
  const generated = new Map(history.items.map(item => [item.materialId, item]));
  const drafts = saved.flatMap(({ selection, root, updatedAt }) => {
    const existing = generated.get(selection.id);
    if (existing?.status === "ready") return [];
    return [{ ...(existing ?? { materialId: selection.id, title: sectionLabel(selection.title === "Pilihan halaman" ? root.title : selection.title), status: "draft",
      first: selection.pageStart, last: selection.pageEnd, pages: selection.sectionPages,
      generatedAt: null, sourceTitle: root.title, sourceName: root.file?.name ?? null,
      sourceMime: root.file?.mime ?? null, folderName: root.folder?.name ?? null }), updatedAt: updatedAt.toISOString() }];
  });
  const savedIds = new Set(drafts.map(item => item.materialId));
  drafts.push(...history.items.filter(item => item.status !== "ready" && !savedIds.has(item.materialId)));
  const matches = (tab === "drafts" ? drafts : ready).filter(item => !query ||
    [item.title, item.sourceTitle, item.sourceName, item.folderName].some(text => text?.toLocaleLowerCase("id").includes(query)));
  const pages = Math.max(1, Math.ceil(matches.length / 10));
  const page = Math.min(requestedPage, pages);
  return { items: matches.slice((page - 1) * 10, page * 10), total: matches.length, page, pages,
    counts: { drafts: drafts.length, history: ready.length } };
}
