import { randomUUID } from "node:crypto";
import { AIError } from "../ai/errors.mjs";
import { ApiError } from "../core/errors.mjs";
import { consumeRateLimit } from "../core/rate-limit.mjs";
import { canonicalMaterialId, getOwnedMaterial } from "./readers.mjs";

const missingMaterial = () => new ApiError(404, "MATERIAL_NOT_FOUND", "Materi tidak ditemukan.");
const sourceChanged = () => new ApiError(409, "SOURCE_CHANGED", "Materi berubah. Buka ulang materi lalu coba lagi.");
const leaseDuration = 150_000; // The provider timeout cannot exceed 120 seconds.

export function createGeneratedMaterial(db, generateJson, { delegate, feature, instructions, validate, archived, inProgress }) {
  return {
    async get(userId, materialId) {
      const id = canonicalMaterialId(materialId);
      const source = id && await db.material.findFirst({ where: { id, userId }, select: { id: true, revision: true } });
      if (!source) throw missingMaterial();
      const row = await db[delegate].findUnique({
        where: { materialId_revision: { materialId: source.id, revision: source.revision } },
        select: { content: true },
      });
      return row?.content ?? null;
    },

    async generate(userId, materialId) {
      const job = await db.$transaction(async tx => {
        const source = await getOwnedMaterial(tx, userId, materialId);
        if (!source) throw missingMaterial();
        if (source.archived) throw new ApiError(409, "MATERIAL_ARCHIVED", archived);
        if (source.extractionStatus !== "ready" || !source.text.trim()) {
          throw new ApiError(409, "MATERIAL_NOT_READY", "Teks materi belum siap digunakan.");
        }
        const key = { materialId: source.id, revision: source.revision };
        const where = { materialId_revision: key };
        const existing = await tx[delegate].findUnique({ where, select: { content: true, leaseUntil: true } });
        if (existing?.content) return { content: existing.content };
        if (existing?.leaseUntil > new Date()) {
          throw new ApiError(409, ...inProgress);
        }
        await consumeRateLimit(tx, "material-" + feature + ":" + userId, 10, 15 * 60_000);
        const lease = { leaseId: randomUUID(), leaseUntil: new Date(Date.now() + leaseDuration) };
        await tx[delegate].upsert({ where, create: { ...key, ...lease }, update: lease });
        return { source, reservation: { ...key, leaseId: lease.leaseId } };
      });

      if (job.content) return job.content;
      try {
        const result = await generateJson(feature, { messages: [
          { role: "system", content: instructions },
          { role: "user", content: JSON.stringify({ title: job.source.title, text: job.source.text }) },
        ] });
        const content = validate(result.content, job.source);
        await db.$transaction(async tx => {
          const latest = await getOwnedMaterial(tx, userId, job.source.id);
          if (!latest || latest.archived || latest.revision !== job.source.revision) throw sourceChanged();
          const updated = await tx[delegate].updateMany({
            where: job.reservation, data: { content, leaseId: null, leaseUntil: null },
          });
          if (!updated.count) throw sourceChanged();
        });
        return content;
      } catch (error) {
        // If cleanup fails, the reservation can be reclaimed after its deadline.
        await db[delegate].deleteMany({ where: job.reservation }).catch(() => {});
        if (error instanceof AIError) {
          const status = error.code === "RATE_LIMITED" ? 429 : 503;
          throw new ApiError(status, error.code, error.message);
        }
        throw error;
      }
    },
  };
}
