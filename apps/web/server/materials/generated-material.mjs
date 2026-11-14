import { randomUUID } from "node:crypto";
import { AIError } from "../ai/errors.mjs";
import { ApiError } from "../core/errors.mjs";
import { consumeRateLimit } from "../core/rate-limit.mjs";
import { canonicalMaterialId, getOwnedMaterial } from "./readers.mjs";
import { generateLessonBatch, generateLessonParts } from "./lesson-content.mjs";

const missingMaterial = () => new ApiError(404, "MATERIAL_NOT_FOUND", "Materi tidak ditemukan.");
const sourceChanged = () => new ApiError(409, "SOURCE_CHANGED", "Materi berubah. Buka ulang materi lalu coba lagi.");
const leaseDuration = 150_000; // The provider timeout cannot exceed 120 seconds.

export function createGeneratedMaterial(db, generateJson, { delegate, feature, instructions, validate, readContent, combineParts, prepareInput, recover, archived, inProgress }) {
  return {
    async get(userId, materialId) {
      const id = canonicalMaterialId(materialId);
      const source = id && await db.material.findFirst({ where: { id, userId }, select: { id: true, revision: true, ...(readContent ? { title: true, text: true } : {}) } });
      if (!source) throw missingMaterial();
      const row = await db[delegate].findUnique({
        where: { materialId_revision: { materialId: source.id, revision: source.revision } },
        select: { content: true },
      });
      const content = row?.content?.__lessonParts ? null : row?.content ?? null;
      return readContent ? readContent(content, source) : content;
    },

    async generate(userId, materialId, { regenerate = false, incremental = false } = {}) {
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
        const saved = existing?.content?.__lessonParts ? null : existing?.content;
        const cached = readContent ? readContent(saved, source) : saved;
        if (cached && !regenerate) return { content: cached };
        if (existing?.leaseUntil > new Date()) {
          throw new ApiError(409, ...inProgress);
        }
        const checkpoint = existing?.content?.__lessonParts;
        const rateKey = checkpoint ? `material-${feature}-continuation` : `material-${feature}`;
        await consumeRateLimit(tx, `${rateKey}:${userId}`, checkpoint ? 60 : 10, 15 * 60_000);
        const lease = { leaseId: randomUUID(), leaseUntil: new Date(Date.now() + leaseDuration) };
        await tx[delegate].upsert({ where, create: { ...key, ...lease }, update: lease });
        return { source, checkpoint, hasPrevious: Boolean(existing?.content), reservation: { ...key, leaseId: lease.leaseId } };
      });

      if (job.content) return job.content;
      try {
        async function generate(text, isPartial = false) {
          const guidance = isPartial
            ? "\nIni potongan berurutan dari materi yang lebih panjang. Jelaskan konsep di potongan ini saja. Lewati pengantar dan penutup umum. Jangan ulangi materi dari luar potongan."
            : "";
          const result = await generateJson(feature, { messages: [
            { role: "system", content: instructions + guidance },
            { role: "user", content: JSON.stringify({ title: job.source.title, text: prepareInput?.(text, job.source.title) ?? text }) },
          ] }).catch(error => {
            const content = recover?.(error, job.source);
            if (!content) throw error;
            return { content };
          });
          return validate(result.content, { ...job.source, text });
        }
        let content;
        if (combineParts && (incremental || job.checkpoint)) {
          const batch = await generateLessonBatch(job.source, generate, combineParts, job.checkpoint);
          const updated = await db[delegate].updateMany({
            where: job.reservation, data: { content: { __lessonParts: batch.state } },
          });
          if (!updated.count) throw sourceChanged();
          job.hasPrevious = true;
          if (batch.failure) throw batch.failure;
          if (!batch.done) {
            await db[delegate].updateMany({ where: job.reservation, data: { leaseId: null, leaseUntil: null } });
            return { status: "preparing", phase: "text",
              completed: batch.state.chunks.filter(chunk => chunk.result !== null).length, total: batch.state.chunks.length };
          }
          content = batch.content;
        } else if (combineParts) {
          content = await generateLessonParts(job.source, generate, combineParts, async () => {
            const updated = await db[delegate].updateMany({ where: job.reservation,
              data: { leaseUntil: new Date(Date.now() + leaseDuration) } });
            if (!updated.count) throw sourceChanged();
          });
        } else content = await generate(job.source.text);
        await db.$transaction(async tx => {
          const latest = await getOwnedMaterial(tx, userId, job.source.id);
          if (!latest || latest.archived || latest.revision !== job.source.revision) throw sourceChanged();
          const updated = await tx[delegate].updateMany({
            where: job.reservation, data: { content, leaseId: null, leaseUntil: null,
              ...(feature === "mindmap" ? { generatedAt: new Date() } : {}),
            },
          });
          if (!updated.count) throw sourceChanged();
        });
        return content;
      } catch (error) {
        // If cleanup fails, the reservation can be reclaimed after its deadline.
        if (job.hasPrevious) {
          await db[delegate].updateMany({ where: job.reservation, data: { leaseId: null, leaseUntil: null } }).catch(() => {});
        } else {
          await db[delegate].deleteMany({ where: job.reservation }).catch(() => {});
        }
        if (error instanceof AIError) {
          if (error.code === "PROVIDER_UNAVAILABLE") {
            console.warn("[media-generation] Provider unavailable", {
              media: delegate,
              upstreamStatus: error.status ?? null,
            });
          }
          const status = error.code === "RATE_LIMITED" ? 429 : 503;
          throw new ApiError(status, error.code, error.message);
        }
        throw error;
      }
    },
  };
}
