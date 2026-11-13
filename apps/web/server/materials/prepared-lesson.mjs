import { randomUUID } from "node:crypto";
import { ApiError } from "../core/errors.mjs";
import { consumeRateLimit } from "../core/rate-limit.mjs";
import { getOwnedMaterial } from "./readers.mjs";
import { lessonSourceFigures } from "./lesson-illustration.mjs";
import { createReadingIllustration } from "./reading-illustration.mjs";
import { createSlideIllustrations } from "./slide-illustrations.mjs";
import { planImageProviders, selectImageBatch } from "./image-routing.mjs";

const changed = () => new ApiError(409, "SOURCE_CHANGED", "Materi berubah. Buka ulang materi lalu coba lagi.");
const leaseDuration = 180_000;

export function createPreparedLesson(db, textService, feature, generateImage, generateJson) {
  const reading = feature === "reading";
  const delegate = reading ? "materialReading" : "materialSlideDeck";
  const images = reading ? "materialReadingIllustration" : "materialSlideIllustration";
  const indexKey = reading ? "sectionIndex" : "slideIndex";
  const imageService = reading ? createReadingIllustration(db, generateImage, generateJson)
    : createSlideIllustrations(db, generateImage, generateJson);
  const entries = content => reading ? content.sections : content.slides;

  async function inspect(userId, materialId, content) {
    const source = await db.material.findFirst({ where: { id: materialId, userId }, select: { id: true, revision: true } });
    if (!source) throw changed();
    const rows = await db[images].findMany({
      where: { materialId, revision: source.revision, OR: [
        { bytes: { not: null } }, { sourceBytes: { not: null } }, { visualSkipped: true },
      ] },
      select: { [indexKey]: true, visualSkipped: true },
    });
    const statuses = entries(content).map((_, index) => {
      const row = rows.find(row => row[indexKey] === index);
      return { ready: Boolean(row && !row.visualSkipped), skipped: Boolean(row?.visualSkipped) };
    });
    return { source, statuses, ready: statuses.every(status => status.ready || status.skipped) };
  }

  async function get(userId, materialId) {
    const content = await textService.get(userId, materialId);
    if (!content) return null;
    const state = await inspect(userId, materialId, content);
    return state.ready ? { ...content, revision: state.source.revision, illustrations: state.statuses } : null;
  }

  return {
    get,
    async generate(userId, materialId) {
      const existing = await textService.get(userId, materialId);
      const content = existing ?? await textService.generate(userId, materialId, { incremental: true });
      if (content?.status === "preparing") return content;
      const state = await inspect(userId, materialId, content);
      if (state.ready) return { ...content, revision: state.source.revision, illustrations: state.statuses };
      if (!existing) return { status: "preparing",
        completed: state.statuses.filter(item => item.ready || item.skipped).length, total: state.statuses.length };
      const job = await db.$transaction(async tx => {
        const source = await getOwnedMaterial(tx, userId, materialId);
        if (!source || source.revision !== state.source.revision) throw changed();
        if (source.archived) throw new ApiError(409, "MATERIAL_ARCHIVED", "Pulihkan materi untuk membuat media.");
        const key = { materialId, revision: source.revision };
        const row = await tx[delegate].findUnique({ where: { materialId_revision: key } });
        if (row?.leaseUntil > new Date()) {
          throw new ApiError(409, "LESSON_IN_PROGRESS", "Media sedang disiapkan. Coba buka lagi sebentar.");
        }
        await consumeRateLimit(tx, "lesson-preparation:" + feature + ":" + userId, 60, 15 * 60_000);
        const leaseId = randomUUID();
        await tx[delegate].update({
          where: { materialId_revision: key }, data: { leaseId, leaseUntil: new Date(Date.now() + leaseDuration) },
        });
        return { source, reservation: { ...key, leaseId } };
      });
      try {
        let plan = await db[delegate].findUnique({
          where: { materialId_revision: { materialId, revision: job.source.revision } }, select: { imagePlan: true },
        });
        if (!plan.imagePlan) {
          const imagePlan = await planImageProviders(generateJson, feature, entries(content));
          const saved = await db[delegate].updateMany({ where: job.reservation, data: { imagePlan } });
          if (!saved.count) throw changed();
          plan = { imagePlan };
        }
        const topics = entries(content).map(entry => reading ? entry.heading : entry.title);
        const sourceFigures = await lessonSourceFigures(db, userId, job.source, topics);
        const pending = state.statuses.flatMap((status, index) => status.ready || status.skipped ? [] : [index]);
        async function prepare(index) {
          const renewal = await db[delegate].updateMany({
            where: job.reservation, data: { leaseUntil: new Date(Date.now() + leaseDuration) },
          });
          if (!renewal.count) throw changed();
          const preparation = { budgeted: true, sourceFigures, provider: plan.imagePlan[index] };
          if (reading) await imageService.generate(userId, materialId, false, index, preparation);
          else await imageService.generate(userId, materialId, job.source.revision, index, false, preparation);
        }
        const results = await Promise.allSettled(selectImageBatch(pending, plan.imagePlan).map(prepare));
        const failed = results.find(result => result.status === "rejected");
        if (failed) throw failed.reason;
        const progress = await inspect(userId, materialId, content);
        if (!progress.ready) return {
          status: "preparing", completed: progress.statuses.filter(item => item.ready || item.skipped).length,
          total: progress.statuses.length,
        };
        const result = await get(userId, materialId);
        if (!result) throw new ApiError(502, "LESSON_NOT_READY", "Gambar materi belum lengkap. Coba lagi.");
        await db[delegate].updateMany({
          where: { ...job.reservation, generatedAt: null }, data: { generatedAt: new Date() },
        });
        return result;
      } finally {
        await db[delegate].updateMany({
          where: job.reservation, data: { leaseId: null, leaseUntil: null },
        }).catch(() => {});
      }
    },
  };
}
