import { randomUUID } from "node:crypto";
import { AIError } from "../ai/errors.mjs";
import { ApiError } from "../core/errors.mjs";
import { consumeRateLimit } from "../core/rate-limit.mjs";
import { illustrationStatus, resolveLessonIllustration } from "./lesson-illustration.mjs";
import { canonicalMaterialId, getOwnedMaterial } from "./readers.mjs";

const missing = () => new ApiError(404, "MATERIAL_NOT_FOUND", "Materi tidak ditemukan.");
const slideMissing = () => new ApiError(404, "SLIDE_NOT_FOUND", "Slide tidak ditemukan.");
const changed = () => new ApiError(409, "SOURCE_CHANGED", "Materi berubah. Buka ulang slide lalu coba lagi.");

function validIndex(index) {
  if (!Number.isInteger(index) || index < 0 || index > 2147483647) throw slideMissing();
}

export function createSlideIllustrations(db, generateIllustration, generateJson) {
  async function readKey(userId, materialId, revision) {
    const id = canonicalMaterialId(materialId);
    const source = id && await db.material.findFirst({ where: { id, userId }, select: { id: true, revision: true } });
    if (!source) throw missing();
    if (source.revision !== revision) throw changed();
    return { materialId: source.id, revision: source.revision };
  }

  return {
    async list(userId, materialId, revision) {
      const key = await readKey(userId, materialId, revision);
      const rows = await db.materialSlideIllustration.findMany({
        where: { ...key, NOT: { bytes: null } }, select: { slideIndex: true }, orderBy: { slideIndex: "asc" },
      });
      return rows.map(row => row.slideIndex);
    },

    async get(userId, materialId, revision, slideIndex, mode) {
      const key = await readKey(userId, materialId, revision);
      validIndex(slideIndex);
      const row = await db.materialSlideIllustration.findUnique({
        where: { materialId_revision_slideIndex: { ...key, slideIndex } },
        select: { bytes: true, sourceBytes: true, visualSkipped: true },
      });
      if (mode === "status") return illustrationStatus(row);
      return row?.sourceBytes ?? row?.bytes ?? null;
    },

    async generate(userId, materialId, revision, slideIndex, replace = false, preparation = {}) {
      const job = await db.$transaction(async tx => {
        const source = await getOwnedMaterial(tx, userId, materialId);
        if (!source) throw missing();
        if (source.revision !== revision) throw changed();
        if (source.archived) throw new ApiError(409, "MATERIAL_ARCHIVED", "Pulihkan materi untuk membuat ilustrasi.");
        validIndex(slideIndex);
        const key = { materialId: source.id, revision: source.revision };
        const deck = await tx.materialSlideDeck.findUnique({ where: { materialId_revision: key }, select: { content: true } });
        const slide = deck?.content?.slides[slideIndex];
        if (!slide) throw slideMissing();
        const imageKey = { ...key, slideIndex };
        const where = { materialId_revision_slideIndex: imageKey };
        const row = await tx.materialSlideIllustration.findUnique({ where });
        if ((row?.bytes || row?.visualSkipped) && !replace) return null;
        if (row?.leaseUntil > new Date()) {
          throw new ApiError(409, "ILLUSTRATION_IN_PROGRESS", "Ilustrasi sedang dibuat. Coba buka lagi sebentar.");
        }
        if (!preparation.budgeted) await consumeRateLimit(tx, "slide-illustration:" + userId, 12, 15 * 60_000);
        const lease = { leaseId: randomUUID(), leaseUntil: new Date(Date.now() + 180_000) };
        await tx.materialSlideIllustration.upsert({ where, create: { ...imageKey, ...lease }, update: lease });
        return { source, slide, outline: deck.content.slides.map(item => item.title), hadImage: Boolean(row?.bytes), reservation: { ...imageKey, leaseId: lease.leaseId } };
      });

      if (!job) return;
      try {
        const visual = await resolveLessonIllustration(db, generateJson, generateIllustration, {
          userId, source: job.source, feature: "slides", title: job.slide.title, lines: job.slide.points, scene: job.slide.scene,
          outline: job.outline, sourceFigures: preparation.sourceFigures,
        });
        await db.$transaction(async tx => {
          const latest = await getOwnedMaterial(tx, userId, job.reservation.materialId);
          if (!latest || latest.archived || latest.revision !== revision) throw changed();
          const updated = await tx.materialSlideIllustration.updateMany({
            where: job.reservation, data: { ...(visual.visualSkipped && job.hadImage ? {} : visual), leaseId: null, leaseUntil: null },
          });
          if (!updated.count) throw changed();
        });
      } catch (error) {
        await db.$transaction(async tx => {
          await tx.materialSlideIllustration.deleteMany({ where: { ...job.reservation, bytes: null, visualSkipped: false } });
          await tx.materialSlideIllustration.updateMany({
            where: job.reservation, data: { leaseId: null, leaseUntil: null },
          });
        }).catch(() => {});
        if (error instanceof AIError) {
          throw new ApiError(error.code === "RATE_LIMITED" ? 429 : 503, error.code, error.message);
        }
        throw error;
      }
    },
  };
}
