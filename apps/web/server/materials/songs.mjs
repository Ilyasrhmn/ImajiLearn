import { randomUUID } from "node:crypto";
import { AIError } from "../ai/errors.mjs";
import { aiCorrection } from "@imajilearn/shared/lib/ai-repair.mjs";
import { ApiError } from "../core/errors.mjs";
import { consumeRateLimit } from "../core/rate-limit.mjs";
import { canonicalMaterialId, getOwnedMaterial } from "./readers.mjs";
import { songInstructions, songLyricsVersion, validateSongLyrics, musicLyrics, alignedSongCues } from "./song-lyrics.mjs";

const select = { materialId: true, revision: true, status: true, content: true, taskId: true, attemptId: true, leaseUntil: true, errorCode: true, createdAt: true, versions: { orderBy: { ordinal: "asc" }, select: { audioId: true, ordinal: true, cues: true } } };
const missing = () => new ApiError(404, "MATERIAL_NOT_FOUND", "Materi tidak ditemukan.");
const changed = () => new ApiError(409, "SOURCE_CHANGED", "Materi berubah. Buka ulang materi lalu coba lagi.");
const messages = {
  MUSIC_GENERATION_FAILED: "Lagu belum berhasil dibuat. Coba lagi.",
  SONG_INTERRUPTED: "Pembuatan lirik terhenti. Kamu bisa mencoba lagi.",
  INVALID_SONG_LYRICS: "Lirik belum sesuai untuk lagu belajar. Coba lagi.",
  MUSIC_PROVIDER_CHANGED: "Layanan musik sudah diperbarui. Coba buat lagu lagi.",
};
function present(row) {
  if (!row) return null;
  const content = row.content;
  return { status: row.status, versions: (row.versions ?? []).map(version => ({ id: version.audioId, number: version.ordinal, cues: version.cues })), ...(content ? { title: content.title, sections: content.sections, learningPoints: content.learningPoints, cues: content.cues ?? [], alignmentPending: Boolean(content.alignmentPending) } : {}), error: row.errorCode ? messages[row.errorCode] ?? new AIError(row.errorCode).message : null };
}
const keyOf = source => ({ materialId: source.id, revision: source.revision });
const boundedStyleTags = value => Array.isArray(value)
  ? [...new Set(value.filter(tag => typeof tag === "string" && tag.trim() && tag.length <= 80 && !/[\u0000-\u001f\u007f]/u.test(tag)).map(tag => tag.trim()))].slice(0, 32)
  : [];

export function createMaterialSongs(db, generateJson, music) {
  async function owned(userId, materialId) {
    const id = canonicalMaterialId(materialId);
    const source = id && await db.material.findFirst({ where: { id, userId }, select: { id: true, revision: true } });
    if (!source) throw missing();
    return source;
  }
  async function read(key) {
    return db.materialSong.findUnique({ where: { materialId_revision: key }, select });
  }
  async function expire(row) {
    if (["writing", "submitting"].includes(row?.status) && (!row.leaseUntil || row.leaseUntil <= new Date())) {
      await db.materialSong.updateMany({ where: { materialId: row.materialId, revision: row.revision, attemptId: row.attemptId, status: row.status },
        data: row.status === "submitting" ? { status: "uncertain", errorCode: "MUSIC_REQUEST_UNKNOWN", leaseUntil: null } : { status: "failed", errorCode: "SONG_INTERRUPTED", leaseUntil: null } });
      return read({ materialId: row.materialId, revision: row.revision });
    }
    return row;
  }
  return {
    async start(userId, materialId) {
      const claim = await db.$transaction(async tx => {
        const source = await getOwnedMaterial(tx, userId, materialId);
        if (!source) throw missing();
        if (source.archived) throw new ApiError(409, "MATERIAL_ARCHIVED", "Pulihkan materi untuk membuat lagu.");
        if (source.extractionStatus !== "ready" || !source.text.trim()) throw new ApiError(409, "MATERIAL_NOT_READY", "Teks materi belum siap digunakan.");
        const key = keyOf(source), where = { materialId_revision: key };
        const row = await tx.materialSong.findUnique({ where, select });
        if (row?.status === "submitting" && (!row.leaseUntil || row.leaseUntil <= new Date())) {
          await tx.materialSong.updateMany({ where: { ...key, attemptId: row.attemptId, status: "submitting", OR: [{ leaseUntil: null }, { leaseUntil: { lte: new Date() } }] }, data: { status: "uncertain", errorCode: "MUSIC_REQUEST_UNKNOWN", leaseUntil: null } });
          return { row: await tx.materialSong.findUnique({ where, select }) };
        }
        if (row && (["generating", "ready", "uncertain"].includes(row.status) || row.leaseUntil > new Date())) return { row };
        await consumeRateLimit(tx, "material-song:" + userId, 3, 15 * 60_000);
        const attemptId = randomUUID();
        await tx.materialSongVersion.deleteMany({ where: key });
        await tx.materialSong.upsert({ where, create: { ...key, attemptId, leaseUntil: new Date(Date.now() + 150_000) },
          update: { status: "writing", attemptId, leaseUntil: new Date(Date.now() + 150_000), taskId: null, errorCode: null } });
        return { source, reservation: { ...key, attemptId } };
      });
      if (claim.row) return present(claim.row);
      const { source, reservation } = claim, key = keyOf(source);
      try {
        music.validate?.();
        const result = await generateJson("song", { messages: [
          { role: "system", content: songInstructions },
          { role: "user", content: JSON.stringify({ title: source.title, text: source.text }) },
        ] });
        const description = music.describe?.();
        const generation = description ? {
          provider: description.provider, requestedModel: description.requestedModel, durationHint: description.durationHint,
          musicPromptVersion: description.musicPromptVersion, lyricsPromptVersion: songLyricsVersion,
          ...(Array.isArray(description.styleTags) ? { requestedStyleTags: boundedStyleTags(description.styleTags) } : {}),
          ...(Array.isArray(description.avoidedStyleTags) ? { avoidedStyleTags: boundedStyleTags(description.avoidedStyleTags) } : {}),
        } : undefined;
        const content = { ...validateSongLyrics(result.content), cues: [], alignmentPending: false, ...(generation ? { generation } : {}) };
        await db.$transaction(async tx => {
          const latest = await getOwnedMaterial(tx, userId, source.id);
          if (!latest || latest.archived || latest.revision !== source.revision) throw changed();
          const update = await tx.materialSong.updateMany({ where: { ...reservation, status: "writing" }, data: { content, status: "submitting", leaseUntil: new Date(Date.now() + 60_000) } });
          if (!update.count) throw changed();
        });
        const taskId = await music.create({ lyrics: musicLyrics(content), title: content.title });
        const update = await db.materialSong.updateMany({ where: { ...reservation, status: { in: ["submitting", "uncertain"] } }, data: { taskId, status: "generating", errorCode: null, leaseUntil: null } });
        if (!update.count) throw new AIError("MUSIC_REQUEST_UNKNOWN");
      } catch (error) {
        const row = await read(key);
        const uncertain = row?.status === "submitting" && (!(error instanceof AIError) || error.code === "MUSIC_REQUEST_UNKNOWN");
        await db.materialSong.updateMany({ where: { ...reservation, status: { in: ["writing", "submitting"] } }, data: { status: uncertain ? "uncertain" : "failed", errorCode: uncertain ? "MUSIC_REQUEST_UNKNOWN" : (error.code === "INVALID_SONG_LYRICS" ? error.code : error instanceof AIError ? error.code : "MUSIC_GENERATION_FAILED"), leaseUntil: null } });
        if (error instanceof ApiError && error.code === "SOURCE_CHANGED") throw error;
        if (row?.status === "writing" && aiCorrection(error.code)) {
          throw new ApiError(502, error.code, error.message);
        }
        if (row?.status === "writing" && error instanceof AIError &&
            ["PROVIDER_TIMEOUT", "PROVIDER_UNAVAILABLE", "RATE_LIMITED"].includes(error.code)) {
          throw new ApiError(error.code === "RATE_LIMITED" ? 429 : 503, error.code, error.message);
        }
        if (!(error instanceof AIError) && !(error instanceof ApiError)) throw error;
      }
      return present(await read(key));
    },

    async get(userId, materialId) {
      const source = await owned(userId, materialId), key = keyOf(source);
      let row = await expire(await read(key));
      if (!row || !row.taskId || (row.status !== "generating" && !(row.status === "ready" && row.content?.alignmentPending))) return present(row);
      const provider = music.describe?.().provider;
      if (provider && row.content?.generation?.provider && row.content.generation.provider !== provider) {
        await db.materialSong.updateMany({ where: { ...key, attemptId: row.attemptId, status: row.status }, data: row.status === "ready"
          ? { content: { ...row.content, alignmentPending: false }, leaseUntil: null }
          : { status: "failed", errorCode: "MUSIC_PROVIDER_CHANGED", leaseUntil: null } });
        return present(await read(key));
      }
      const reservation = { ...key, attemptId: row.attemptId };
      const leaseUntil = new Date(Date.now() + 300_000);
      const pollReservation = { ...reservation, leaseUntil };
      const claimed = await db.materialSong.updateMany({ where: { ...reservation, status: row.status, OR: [{ leaseUntil: null }, { leaseUntil: { lte: new Date() } }] },
        data: { leaseUntil } });
      if (!claimed.count) return present(row);
      try {
        const result = await music.retrieve(row.taskId, row.content?.generation?.audioId);
        if (!await db.materialSong.findFirst({ where: pollReservation, select: { attemptId: true } })) return present(await read(key));
        if (result.status === "FAILURE") {
          await db.materialSong.updateMany({ where: pollReservation, data: { status: "failed", errorCode: "MUSIC_GENERATION_FAILED", leaseUntil: null } });
        } else if (result.status === "SUCCESS" && result.tracks?.length) {
          for (const [index, track] of result.tracks.entries()) {
            const where = { materialId_revision_audioId: { ...key, audioId: track.audioId } };
            let version = await db.materialSongVersion.upsert({ where, create: { ...key, audioId: track.audioId, ordinal: index + 1 }, update: {} });
            if (!version.alignmentAttempted && music.align) {
              const held = await db.materialSong.updateMany({ where: pollReservation, data: { errorCode: null } });
              if (!held.count) return present(await read(key));
              await db.materialSongVersion.update({ where, data: { alignmentAttempted: true } });
              let alignment;
              try { alignment = await music.align(row.taskId, track.audioId); }
              catch (error) { if (!(error instanceof AIError)) throw error; }
              version = await db.materialSongVersion.update({ where, data: { cues: alignedSongCues(alignment, row.content) } });
            }
            if (!version.audio) {
              const audio = await music.download(track.audioUrl);
              await db.$transaction(async tx => {
                const latest = await getOwnedMaterial(tx, userId, source.id);
                if (!latest || latest.archived || latest.revision !== source.revision) throw changed();
                const held = await tx.materialSong.updateMany({ where: pollReservation, data: { errorCode: null } });
                if (!held.count) throw changed();
                await tx.materialSongVersion.update({ where, data: { audio } });
              });
            }
          }
          const first = await db.materialSongVersion.findFirst({ where: key, orderBy: { ordinal: "asc" }, select: { cues: true } });
          const actualModel = typeof result.model_version === "string" && /^[a-z\d][a-z\d._-]{0,79}$/i.test(result.model_version) ? result.model_version : null;
          const actualStyleTags = boundedStyleTags(result.tags);
          await db.materialSong.updateMany({ where: pollReservation, data: {
            status: "ready", content: { ...row.content, cues: first?.cues ?? [], alignmentPending: false,
              generation: { ...row.content.generation, ...(actualModel ? { actualModel } : {}), ...(actualStyleTags.length ? { actualStyleTags } : {}) },
            }, errorCode: null, leaseUntil: null,
          } });
        } else if (result.status === "SUCCESS") {
          let alignment = result.word_aligned_lyrics;
          if (music.align && result.audioId && !row.content.alignmentAttempted) {
            // Reserve before the paid alignment call so reopening never submits it twice.
            row.content = { ...row.content, alignmentAttempted: true, generation: { ...row.content.generation, audioId: result.audioId } };
            const held = await db.materialSong.updateMany({ where: pollReservation, data: { content: row.content } });
            if (!held.count) return present(await read(key));
            try { alignment = await music.align(row.taskId, result.audioId); }
            catch (error) {
              if (!(error instanceof AIError)) throw error;
              row.content.alignmentError = error.code;
            }
            row.content.cues = alignedSongCues(alignment, row.content);
            await db.materialSong.updateMany({ where: pollReservation, data: { content: row.content } });
          }
          const cues = row.content.alignmentAttempted ? row.content.cues ?? [] : alignedSongCues(alignment, row.content);
          const alignmentWaitUntil = row.content.alignmentWaitUntil ?? Date.now() + 10 * 60_000;
          const alignmentPending = ["REQUESTED", "TASK_SENT", "ALIGNING"].includes(result.alignment_status) && Date.now() < alignmentWaitUntil;
          const actualModel = typeof result.model_version === "string" && /^[a-z\d][a-z\d._-]{0,79}$/i.test(result.model_version) ? result.model_version : null;
          const actualStyleTags = boundedStyleTags(result.tags);
          const generation = actualModel || actualStyleTags.length ? {
            ...row.content.generation,
            ...(actualModel ? { actualModel } : {}),
            ...(actualStyleTags.length ? { actualStyleTags } : {}),
          } : row.content.generation;
          const content = { ...row.content, cues, alignmentPending, alignmentWaitUntil, ...(generation ? { generation } : {}) };
          const audio = row.status === "ready" ? undefined : await music.download(result.song_paths?.[0]);
          await db.$transaction(async tx => {
            const latest = await getOwnedMaterial(tx, userId, source.id);
            if (!latest || latest.revision !== source.revision) throw changed();
            await tx.materialSong.updateMany({ where: pollReservation, data: { content, audio, status: "ready", errorCode: null, leaseUntil: alignmentPending ? new Date(Date.now() + 5000) : null } });
          });
        } else {
          await db.materialSong.updateMany({ where: pollReservation, data: { leaseUntil: new Date(Date.now() + 5000) } });
        }
      } catch (error) {
        await db.materialSong.updateMany({ where: pollReservation, data: { leaseUntil: null } });
        if (error instanceof AIError) throw new ApiError(503, error.code, error.message);
        throw error;
      }
      row = await read(key);
      return present(row);
    },

    async audio(userId, materialId, revision, versionId) {
      const source = await owned(userId, materialId);
      if (source.revision !== revision) throw changed();
      const row = await db.materialSong.findUnique({ where: { materialId_revision: keyOf(source) }, select: { status: true, audio: true } });
      if (row?.status === "ready") {
        const version = await db.materialSongVersion.findFirst({ where: { ...keyOf(source), ...(versionId ? { audioId: versionId } : {}) }, orderBy: { ordinal: "asc" }, select: { audio: true } });
        if (version?.audio) return { bytes: Buffer.from(version.audio), mime: "audio/mpeg" };
        if (versionId) throw new ApiError(404, "SONG_AUDIO_NOT_FOUND", "Versi lagu tidak ditemukan.");
      }
      if (row?.status !== "ready" || !row.audio) throw new ApiError(404, "SONG_AUDIO_NOT_FOUND", "Audio lagu belum tersedia.");
      return { bytes: Buffer.from(row.audio), mime: "audio/mpeg" };
    },
  };
}
