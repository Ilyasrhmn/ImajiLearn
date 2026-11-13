import { mediaJobs } from "@imajilearn/shared/lib/media-jobs.mjs";
import { generateMaterialMedia } from "./material-media.mjs";
import { waitForSong } from "./song-polling.mjs";
import { resolveVisualModel } from "./visual-templates.mjs";
import { studioRequest } from "./studio-api.mjs";

export function startMaterialJob({ teacherId, format, source, libraryId, path, draftPath, href, resumeHref, pollSong = false }) {
  return mediaJobs.start({ teacherId, materialId: source.id, revision: source.revision, feature: format.id,
    action: format.action, label: format.label, title: source.title, href, resumeHref,
  }, async ({ signal, onProgress }) => {
    let data = pollSong ? await waitForSong(teacherId, path, { signal, onProgress, immediate: true })
      : await generateMaterialMedia(teacherId, path, libraryId, format.id, { signal, onProgress });
    if (format.id === "song") {
      if (data && !["ready", "failed", "uncertain"].includes(data.status)) data = await waitForSong(teacherId, path, { signal, onProgress });
      if (data?.status !== "ready") throw new Error(data?.error ?? "Lagu belum berhasil dibuat. Buka draf untuk melanjutkan.");
    }
    if (format.id === "mindmap" && !resolveVisualModel(data)) throw new Error("Visual belum lengkap. Buka draf untuk melanjutkan.");
    if (!data || ((format.id === "reading" || format.id === "slides") && !data[format.id === "reading" ? "sections" : "slides"]?.length)) {
      throw new Error("Media belum lengkap. Buka draf untuk melanjutkan.");
    }
    signal.throwIfAborted();
    if (draftPath) await studioRequest(teacherId, draftPath, { method: "DELETE", body: { materialId: source.id }, signal }).catch(() => {});
    signal.throwIfAborted();
    return { ...data, revision: source.revision };
  });
}
