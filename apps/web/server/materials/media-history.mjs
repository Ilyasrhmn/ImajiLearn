import { ApiError } from "../core/errors.mjs";
import { Prisma } from "../generated/prisma/index.js";
import { canonicalMaterialId } from "./readers.mjs";
import { resolveVisualModel } from "../../lib/visual-templates.mjs";
import { sectionLabel } from "../../lib/material-section-label.mjs";

const models = {
  reading: { table: "MaterialReading", images: "MaterialReadingIllustration", entries: "sections", index: "sectionIndex" },
  slides: { table: "MaterialSlideDeck", images: "MaterialSlideIllustration", entries: "slides", index: "slideIndex" },
  mindmap: { table: "MaterialVisual" },
  song: { table: "MaterialSong" },
};
const missing = () => new ApiError(404, "MATERIAL_NOT_FOUND", "Materi tidak ditemukan.");

// Only visual history needs source text to reject cached models for the wrong subject; image/audio bytes stay in PostgreSQL.
export async function* scanMediaHistory(db, userId, feature, { rootId = null, materialIds, offset = 0, take = 100 } = {}) {
  const model = models[feature];
  const table = Prisma.raw(`"${model.table}"`);
  const entries = model.entries && Prisma.sql`CASE WHEN jsonb_typeof(e."content" -> ${model.entries}) = 'array'
    THEN jsonb_array_length(e."content" -> ${model.entries}) ELSE 0 END`;
  const prepared = model.images ? Prisma.sql`(${entries}) > 0 AND (${entries}) = (
    SELECT count(*) FROM ${Prisma.raw(`"${model.images}"`)} i
    WHERE i."materialId" = e."materialId" AND i."revision" = e."revision"
      AND i.${Prisma.raw(`"${model.index}"`)} >= 0 AND i.${Prisma.raw(`"${model.index}"`)} < (${entries})
      AND (i."bytes" IS NOT NULL OR i."sourceBytes" IS NOT NULL OR i."visualSkipped")
  )` : Prisma.sql`false`;
  const content = feature === "mindmap" ? Prisma.sql`e."content"` : Prisma.sql`jsonb_build_object(
    'title', e."content" -> 'title',
    'sections', jsonb_build_array(jsonb_build_object('heading', e."content" #> '{sections,0,heading}')),
    'slides', jsonb_build_array(jsonb_build_object('title', e."content" #> '{slides,0,title}'))
  )`;
  const sortAt = feature === "song" ? Prisma.sql`e."updatedAt"` : Prisma.sql`e."generatedAt"`;
  const tieAt = feature === "song" ? Prisma.sql`'-infinity'::timestamptz` : Prisma.sql`m."createdAt"`;
  let cursor = null;
  do {
    const rows = await db.$queryRaw`
      SELECT m."id" AS "materialId", m."title" AS "materialTitle", m."pageStart" AS "first", m."pageEnd" AS "last",
        m."sectionPages" AS "pages", COALESCE(p."title", m."title") AS "sourceTitle",
        f."name" AS "sourceName", f."mime" AS "sourceMime", folder."name" AS "folderName",
        ${content} AS "content", ${prepared} AS "prepared",
        ${feature === "mindmap" ? Prisma.sql`m."text"` : Prisma.sql`NULL::text`} AS "validationText",
        ${feature === "song" ? Prisma.sql`e."status"` : Prisma.sql`NULL::text`} AS "songStatus",
        e."leaseUntil", ${sortAt} AS "sortAt", m."createdAt" AS "createdAt",
        ${feature === "song" ? Prisma.sql`NULL::timestamptz` : Prisma.sql`e."generatedAt"`} AS "generatedAt",
        EXISTS (SELECT 1 FROM "MediaDraft" d JOIN "Material" dr ON dr."id" = d."rootId" AND dr."userId" = d."userId"
          WHERE d."selectionId" = m."id" AND d."userId" = ${userId}::uuid
          AND d."feature" = ${feature} AND NOT m."archived" AND NOT dr."archived") AS "saved"
      FROM ${table} e
      JOIN "Material" m ON m."id" = e."materialId" AND m."revision" = e."revision"
      LEFT JOIN "Material" p ON p."id" = m."parentId" AND p."userId" = m."userId"
      LEFT JOIN "MaterialFile" f ON f."materialId" = COALESCE(p."id", m."id") AND f."userId" = m."userId"
      LEFT JOIN "Folder" folder ON folder."id" = CASE WHEN p."id" IS NULL THEN m."folderId" ELSE p."folderId" END
        AND folder."userId" = m."userId"
      WHERE m."userId" = ${userId}::uuid
        AND ${rootId ? Prisma.sql`(m."id" = ${rootId}::uuid OR m."parentId" = ${rootId}::uuid)`
          : Prisma.sql`NOT m."archived" AND NOT COALESCE(p."archived", false)`}
        ${materialIds ? Prisma.sql`AND m."id" IN (${Prisma.join(materialIds.map(id => Prisma.sql`${id}::uuid`))})` : Prisma.empty}
        ${cursor ? Prisma.sql`AND (COALESCE(${sortAt}, '-infinity'::timestamptz), ${tieAt}, m."id") <
          (COALESCE(${cursor.sortAt}::timestamptz, '-infinity'::timestamptz),
          ${feature === "song" ? Prisma.sql`'-infinity'::timestamptz` : Prisma.sql`${cursor.createdAt}::timestamptz`}, ${cursor.materialId}::uuid)` : Prisma.empty}
      ORDER BY ${sortAt} DESC NULLS LAST, ${tieAt} DESC, m."id" DESC
      LIMIT ${take} OFFSET ${cursor ? 0 : offset}`;
    for (const row of rows) {
      let status = "ready";
      if (feature === "song") status = row.songStatus === "ready" ? "ready" : ["failed", "uncertain"].includes(row.songStatus) ? "incomplete" : "preparing";
      else if (model.images && !row.prepared) status = row.leaseUntil > new Date() ? "preparing" : "incomplete";
      else if (feature === "mindmap" && !resolveVisualModel(row.content, { title: row.materialTitle, text: row.validationText })) status = "incomplete";
      const title = row.content?.title;
      const label = title && !/^(?:pilihan halaman|hlm\.|halaman \d)/iu.test(title) ? title
        : row.content?.sections?.[0]?.heading ?? row.content?.slides?.[0]?.title ?? row.materialTitle;
      yield { item: {
        materialId: row.materialId, title: sectionLabel(label), status,
        first: row.first, last: row.last, pages: row.pages,
        generatedAt: (feature === "song" && status === "ready" ? row.sortAt : row.generatedAt)?.toISOString() ?? null,
        sourceTitle: row.sourceTitle, sourceName: row.sourceName, sourceMime: row.sourceMime, folderName: row.folderName,
      }, saved: row.saved, searchValues: [title, row.materialTitle, row.sourceTitle, row.sourceName, row.folderName] };
    }
    cursor = rows.length === take ? rows.at(-1) : null;
  } while (cursor);
}

export async function materialMediaHistory(db, userId, materialId, params, { all = false } = {}) {
  const feature = params.get("feature");
  const offset = Number(params.get("offset") ?? 0);
  const query = (params.get("q") ?? "").trim().toLocaleLowerCase("id-ID");
  if (query.length > 200 || !Object.hasOwn(models, feature) || !Number.isInteger(offset) || offset < 0 || offset > 10000) {
    throw new ApiError(422, "INVALID_MEDIA_HISTORY", "Riwayat media tidak valid.");
  }
  const studio = materialId === null;
  const id = !studio && canonicalMaterialId(materialId);
  const material = id && await db.material.findFirst({ where: { id, userId }, select: { id: true, parentId: true } });
  if (!studio && !material) throw missing();
  const rootId = studio ? null : material.parentId ?? material.id;
  const items = [];
  let skipped = 0;
  for await (const { item, searchValues } of scanMediaHistory(db, userId, feature,
    { rootId, offset: !all && !query ? offset : 0, take: !all && !query ? 21 : 100 })) {
    if (query && !searchValues.some(value => typeof value === "string" && value.toLocaleLowerCase("id-ID").includes(query))) continue;
    if (!all && query && skipped++ < offset) continue;
    items.push(item);
    if (!all && items.length === 21) break;
  }
  const more = !all && items.length > 20;
  return { parentId: rootId, items: more ? items.slice(0, 20) : items, nextOffset: more ? offset + 20 : null };
}
