import { ApiError } from "../core/errors.mjs";
import { canonicalMaterialId } from "./readers.mjs";
import { resolveVisualModel } from "../../lib/visual-templates.mjs";
import { sectionLabel } from "../../lib/material-section-label.mjs";

const models = {
  reading: { content: "materialReading", images: "materialReadingIllustration", entries: "sections", index: "sectionIndex" },
  slides: { content: "materialSlideDeck", images: "materialSlideIllustration", entries: "slides", index: "slideIndex" },
  mindmap: { content: "materialVisual" },
  song: { content: "materialSong" },
};
const missing = () => new ApiError(404, "MATERIAL_NOT_FOUND", "Materi tidak ditemukan.");

export async function materialMediaHistory(db, userId, materialId, params, { all = false } = {}) {
  const feature = params.get("feature");
  const model = Object.hasOwn(models, feature) ? models[feature] : null;
  const offset = Number(params.get("offset") ?? 0);
  if (!model || !Number.isInteger(offset) || offset < 0 || offset > 10000) {
    throw new ApiError(422, "INVALID_MEDIA_HISTORY", "Riwayat media tidak valid.");
  }
  const studio = materialId === null;
  const id = !studio && canonicalMaterialId(materialId);
  const material = id && await db.material.findFirst({ where: { id, userId }, select: { id: true, parentId: true } });
  if (!studio && !material) throw missing();
  const rootId = studio ? null : material.parentId ?? material.id;
  const family = await db.material.findMany({
    where: studio ? { userId, archived: false, OR: [{ parentId: null }, { parent: { archived: false } }] }
      : { userId, OR: [{ id: rootId }, { parentId: rootId }] },
    select: { id: true, title: true, revision: true, pageStart: true, pageEnd: true, sectionPages: true,
      ...(studio ? {
        file: { select: { name: true, mime: true } },
        folder: { select: { name: true } },
        parent: { select: { title: true, file: { select: { name: true, mime: true } }, folder: { select: { name: true } } } },
      } : {}),
    },
  });
  const sources = new Map(family.map(source => [source.id, source]));
  const rows = await db[model.content].findMany({
    where: { OR: family.map(source => ({ materialId: source.id, revision: source.revision })) },
    select: { materialId: true, revision: true, content: true,
      ...(feature === "song" ? { status: true, updatedAt: true } : { generatedAt: true, leaseUntil: true }),
    },
    orderBy: feature === "song" ? [{ updatedAt: "desc" }, { materialId: "desc" }]
      : [{ generatedAt: { sort: "desc", nulls: "last" } }, { material: { createdAt: "desc" } }, { materialId: "desc" }],
    ...(all ? {} : { skip: offset, take: 21 }),
  });
  const page = all ? rows : rows.slice(0, 20);
  const images = model.images && page.length ? await db[model.images].findMany({
    where: { OR: page.map(row => ({ materialId: row.materialId, revision: row.revision })),
      AND: { OR: [{ bytes: { not: null } }, { sourceBytes: { not: null } }, { visualSkipped: true }] },
    },
    select: { materialId: true, revision: true, [model.index]: true },
  }) : [];
  return {
    parentId: rootId,
    items: page.map(row => {
      const source = sources.get(row.materialId);
      let status = "ready";
      if (feature === "song") status = row.status === "ready" ? "ready" : ["failed", "uncertain"].includes(row.status) ? "incomplete" : "preparing";
      else if (model.images) {
        const prepared = new Set(images.filter(image => image.materialId === row.materialId && image.revision === row.revision)
          .map(image => image[model.index]));
        if (!row.content?.[model.entries]?.length || !row.content[model.entries].every((_, index) => prepared.has(index))) {
          status = row.leaseUntil > new Date() ? "preparing" : "incomplete";
        }
      } else if (!resolveVisualModel(row.content)) status = "incomplete";
      const title = row.content?.title;
      const label = title && !/^(?:pilihan halaman|hlm\.|halaman \d)/iu.test(title) ? title
        : row.content?.sections?.[0]?.heading ?? row.content?.slides?.[0]?.title ?? source.title;
      return {
        materialId: source.id, title: sectionLabel(label), status,
        first: source.pageStart, last: source.pageEnd, pages: source.sectionPages,
        generatedAt: (feature === "song" && status === "ready" ? row.updatedAt : row.generatedAt)?.toISOString() ?? null,
        ...(studio ? {
          sourceTitle: source.parent?.title ?? source.title,
          sourceName: (source.parent ?? source).file?.name ?? null,
          sourceMime: (source.parent ?? source).file?.mime ?? null,
          folderName: (source.parent ?? source).folder?.name ?? null,
        } : {}),
      };
    }),
    nextOffset: !all && rows.length > 20 ? offset + 20 : null,
  };
}
