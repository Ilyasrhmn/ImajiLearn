import { randomUUID } from "node:crypto";
import { AIError } from "../ai/errors.mjs";
import { illustrationStatus, resolveLessonIllustration } from "./lesson-illustration.mjs";
import { ApiError } from "../core/errors.mjs";
import { consumeRateLimit } from "../core/rate-limit.mjs";
import { canonicalMaterialId, getOwnedMaterial } from "./readers.mjs";
import { budgetedImageGenerator } from "./image-routing.mjs";
import { replacementStatus, reserveImageReplacement } from "./image-replacements.mjs";

const missingMaterial = () => new ApiError(404, "MATERIAL_NOT_FOUND", "Materi tidak ditemukan.");
const readingMissing = () => new ApiError(409, "READING_NOT_READY", "Buat bacaan dulu untuk menambahkan ilustrasi.");
const sourceChanged = () => new ApiError(409, "SOURCE_CHANGED", "Materi berubah. Buka ulang bacaan lalu coba lagi.");
const clearLease = { leaseId: null, leaseUntil: null };
const imageKey = key => ({ materialId_revision_sectionIndex: key });

function chapterIndex(content, sectionIndex) {
  if (!Array.isArray(content.sections)) throw readingMissing();
  const index = sectionIndex ?? content.illustration?.sectionIndex ?? 0;
  if (!Number.isInteger(index) || !content.sections[index]) {
    throw new ApiError(404, "READING_SECTION_NOT_FOUND", "Bagian bacaan tidak ditemukan.");
  }
  return index;
}

export function createReadingIllustration(db, generateIllustration, generateJson) {
  return {
    async get(userId, materialId, sectionIndex, mode) {
      const id = canonicalMaterialId(materialId);
      const source = id && await db.material.findFirst({ where: { id, userId }, select: { id: true, revision: true } });
      if (!source) throw missingMaterial();
      const row = await db.materialReading.findUnique({
        where: { materialId_revision: { materialId: source.id, revision: source.revision } },
        select: { content: true, imageReplacements: true },
      });
      if (!row?.content) return mode === "status" ? illustrationStatus(null) : null;
      const where = imageKey({ materialId: source.id, revision: source.revision, sectionIndex: chapterIndex(row.content, sectionIndex) });
      const image = await db.materialReadingIllustration.findUnique({ where, select: {
        bytes: true, sourceBytes: true, visualSkipped: true,
      } });
      if (mode === "status") return { ...illustrationStatus(image), replacements: replacementStatus(row.imageReplacements) };
      return image?.sourceBytes ?? image?.bytes ?? null;
    },

    async generate(userId, materialId, replace = false, sectionIndex, preparation = {}) {
      const job = await db.$transaction(async tx => {
        const source = await getOwnedMaterial(tx, userId, materialId);
        if (!source) throw missingMaterial();
        if (source.archived) throw new ApiError(409, "MATERIAL_ARCHIVED", "Pulihkan materi untuk membuat ilustrasi.");
        const key = { materialId: source.id, revision: source.revision };
        const where = { materialId_revision: key };
        const row = await tx.materialReading.findUnique({ where });
        if (!row?.content) throw readingMissing();
        const index = chapterIndex(row.content, sectionIndex);
        const image = { ...key, sectionIndex: index };
        const imageWhere = imageKey(image);
        const stored = await tx.materialReadingIllustration.findUnique({ where: imageWhere });
        if ((stored?.bytes || stored?.visualSkipped) && !replace) return { cached: true, illustration: stored.sourceBytes ?? stored.bytes };
        if (stored?.leaseUntil > new Date()) {
          throw new ApiError(409, "ILLUSTRATION_IN_PROGRESS", "Ilustrasi sedang dibuat. Coba buka lagi sebentar.");
        }
        if (replace && !stored?.providerTaskId) await reserveImageReplacement(tx, "materialReading", key);
        if (!preparation.budgeted) await consumeRateLimit(tx, "reading-illustration:" + userId, 10, 15 * 60_000);
        const lease = { leaseId: randomUUID(), leaseUntil: new Date(Date.now() + 270_000) };
        await tx.materialReadingIllustration.upsert({
          where: imageWhere, create: { ...image, ...lease }, update: lease,
        });
        const chapter = row.content.sections[index];
        const scene = row.content.illustration?.sectionIndex === index ? row.content.illustration.scene : undefined;
        return { source, chapter, scene, provider: preparation.provider ?? row.imagePlan?.[index], outline: row.content.sections.map(item => item.heading), previous: stored?.sourceBytes ?? stored?.bytes, providerTaskId: stored?.providerTaskId, reservation: { ...image, leaseId: lease.leaseId } };
      });

      if (job.cached) return job.illustration;
      try {
        const generateImage = budgetedImageGenerator(db, "reading", job.reservation, job.provider, generateIllustration);
        const visual = await resolveLessonIllustration(db, generateJson, generateImage, {
          userId, source: job.source, feature: "reading", title: job.chapter.heading, lines: job.chapter.paragraphs, scene: job.scene,
          outline: job.outline, sourceFigures: preparation.sourceFigures,
          imageTask: { taskId: job.providerTaskId, onTask: async providerTaskId => {
            const updated = await db.materialReadingIllustration.updateMany({ where: job.reservation, data: { providerTaskId } });
            if (!updated.count) throw new ApiError(409, "SOURCE_CHANGED", "Materi berubah. Buka ulang lalu coba lagi.");
          } },
        });
        await db.$transaction(async tx => {
          const latest = await getOwnedMaterial(tx, userId, job.reservation.materialId);
          if (!latest || latest.archived || latest.revision !== job.reservation.revision) throw sourceChanged();
          const updated = await tx.materialReadingIllustration.updateMany({
            where: job.reservation, data: { ...(visual.visualSkipped && job.previous ? {} : visual), providerTaskId: null, ...clearLease },
          });
          if (!updated.count) throw sourceChanged();
        });
        return visual.bytes ?? job.previous ?? null;
      } catch (error) {
        await db.materialReadingIllustration.updateMany({ where: job.reservation, data: clearLease }).catch(() => {});
        if (error instanceof AIError) {
          throw new ApiError(error.code === "RATE_LIMITED" ? 429 : 503, error.code, error.message);
        }
        throw error;
      }
    },
  };
}
