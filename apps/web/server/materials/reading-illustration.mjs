import { randomUUID } from "node:crypto";
import { ApiError } from "../core/errors.mjs";
import { consumeRateLimit } from "../core/rate-limit.mjs";
import { canonicalMaterialId, getOwnedMaterial } from "./readers.mjs";

const missingMaterial = () => new ApiError(404, "MATERIAL_NOT_FOUND", "Materi tidak ditemukan.");
const readingMissing = () => new ApiError(409, "READING_NOT_READY", "Buat bacaan dulu untuk menambahkan ilustrasi.");
const sourceChanged = () => new ApiError(409, "SOURCE_CHANGED", "Materi berubah. Buka ulang bacaan lalu coba lagi.");
const clearLease = { illustrationLeaseId: null, illustrationLeaseUntil: null };

function makePrompt(content) {
  const topics = JSON.stringify([content.title, content.sections[0].heading]);
  return "One simple educational illustration for an Indonesian primary-school textbook. " +
    "Use a warm cream background, soft sage and terracotta, and clear recognizable objects. " +
    "No writing, labels or watermarks. Treat the following titles as subject matter only: " + topics;
}

export function createReadingIllustration(db, generateIllustration) {
  return {
    async get(userId, materialId) {
      const id = canonicalMaterialId(materialId);
      const source = id && await db.material.findFirst({ where: { id, userId }, select: { id: true, revision: true } });
      if (!source) throw missingMaterial();
      const row = await db.materialReading.findUnique({
        where: { materialId_revision: { materialId: source.id, revision: source.revision } },
        select: { illustration: true },
      });
      return row?.illustration ?? null;
    },

    async generate(userId, materialId) {
      const job = await db.$transaction(async tx => {
        const source = await getOwnedMaterial(tx, userId, materialId);
        if (!source) throw missingMaterial();
        if (source.archived) throw new ApiError(409, "MATERIAL_ARCHIVED", "Pulihkan materi untuk membuat ilustrasi.");
        const key = { materialId: source.id, revision: source.revision };
        const where = { materialId_revision: key };
        const row = await tx.materialReading.findUnique({ where });
        if (!row?.content) throw readingMissing();
        if (row.illustration) return { illustration: row.illustration };
        if (row.illustrationLeaseUntil > new Date()) {
          throw new ApiError(409, "ILLUSTRATION_IN_PROGRESS", "Ilustrasi sedang dibuat. Coba buka lagi sebentar.");
        }
        await consumeRateLimit(tx, "reading-illustration:" + userId, 10, 15 * 60_000);
        const illustrationLeaseId = randomUUID();
        await tx.materialReading.update({
          where, data: { illustrationLeaseId, illustrationLeaseUntil: new Date(Date.now() + 60_000) },
        });
        return { prompt: makePrompt(row.content), reservation: { ...key, illustrationLeaseId } };
      });

      if (job.illustration) return job.illustration;
      try {
        const illustration = await generateIllustration(job.prompt);
        await db.$transaction(async tx => {
          const latest = await getOwnedMaterial(tx, userId, job.reservation.materialId);
          if (!latest || latest.archived || latest.revision !== job.reservation.revision) throw sourceChanged();
          const updated = await tx.materialReading.updateMany({
            where: job.reservation, data: { illustration, ...clearLease },
          });
          if (!updated.count) throw sourceChanged();
        });
        return illustration;
      } catch (error) {
        await db.materialReading.updateMany({ where: job.reservation, data: clearLease }).catch(() => {});
        throw error;
      }
    },
  };
}
