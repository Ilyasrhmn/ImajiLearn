import { digest } from "../core/crypto.mjs";
import { ApiError } from "../core/errors.mjs";
import { describePdfSections, extractPdf } from "./pdf.mjs";
import { createMaterialService } from "./service.mjs";
import { sourceTextLimitMessage } from "../../lib/material-limits.mjs";

export async function materialSections(db, userId, materialId, params) {
  const service = createMaterialService(db);
  const material = await service.get(userId, materialId);
  const file = await service.file(userId, materialId);
  if (material.parentId || file.mime !== "application/pdf") throw new ApiError(404, "PDF_NOT_FOUND", "PDF sumber tidak ditemukan.");
  const metadata = await describePdfSections(file.bytes);
  if (!params) return metadata;
  if (material.archived) throw new ApiError(409, "MATERIAL_ARCHIVED", "Pulihkan materi untuk memilih bagian.");
  const picked = params.getAll("range");
  const ranges = picked.length ? picked.map(range => /^([1-9]\d{0,2})-([1-9]\d{0,2})$/.exec(range)?.slice(1).map(Number))
    : [[Number(params.get("first")), Number(params.get("last"))]];
  if (ranges.length > 100 || ranges.some(range => !range || !range.every(Number.isInteger) ||
      range[0] < 1 || range[1] < range[0] || range[1] > metadata.pages)) {
    throw new ApiError(422, "INVALID_PAGE_RANGE", "Rentang halaman tidak valid.");
  }
  const pages = [...new Set(ranges.flatMap(([first, last]) => Array.from({ length: last - first + 1 }, (_, i) => first + i)))].sort((a, b) => a - b);
  if (pages.length === metadata.pages && !["SOURCE_TEXT_UNREADABLE", "SOURCE_EXTRACTION_TIMEOUT"].includes(material.extractionError)) {
    if (material.extractionStatus !== "ready") {
      throw new ApiError(422, material.extractionError ?? "SOURCE_TEXT_UNREADABLE",
        material.extractionError === "SOURCE_TEXT_TOO_LONG" ? sourceTextLimitMessage : "Teks sumber belum dapat dibaca. Pilih bagian lain.");
    }
    return { id: material.id };
  }
  const first = pages[0], last = pages.at(-1);
  const contiguous = pages.length === last - first + 1;
  const text = await extractPdf(file.bytes, { first, last, pages });
  if (!text || text.includes("\0")) throw new ApiError(422, "SOURCE_TEXT_UNREADABLE", "Teks pada halaman ini tidak terbaca.");
  const title = pages.length === metadata.pages ? material.title
    : contiguous && metadata.sections.find(section => !section.pageGroup && section.first === first && section.last === last)?.title || "Pilihan halaman";
  const revision = digest(JSON.stringify(contiguous ? [material.revision, first, last, text] : [material.revision, pages, text]));
  return service.withOwnedMaterial(userId, materialId, (tx, parent) => {
    if (parent.archived) throw new ApiError(409, "MATERIAL_ARCHIVED", "Pulihkan materi untuk memilih bagian.");
    return tx.material.upsert({
      where: { parentId_revision: { parentId: parent.id, revision } },
      update: {},
      create: { parentId: parent.id, userId, title, text, revision, pageStart: first, pageEnd: last, sectionPages: contiguous ? [] : pages },
      select: { id: true },
    });
  });
}
