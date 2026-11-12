import { studioRequest } from "./studio-api.mjs";
import { preloadLessonImages } from "./lesson-images.mjs";

export async function rememberMaterialMedia(teacherId, materialId, media) {
  const id = encodeURIComponent(materialId);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { data: [preference] } = await studioRequest(teacherId, `/media-preferences?materialIds=${id}`);
      if (!preference) return;
      const selectedMedia = [...new Set([...preference.selectedMedia, ...media])];
      if (selectedMedia.length === preference.selectedMedia.length) return;
      await studioRequest(teacherId, `/media-preferences/${id}`, {
        method: "PUT",
        version: preference.resourceVersion,
        body: { selectedMedia, songTemplateId: preference.songTemplateId },
      });
      return;
    } catch (error) {
      if (error.status !== 412) return;
    }
  }
}

function waitForProvider(milliseconds, signal) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const cancel = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", cancel); resolve(); }, milliseconds);
    signal?.addEventListener("abort", cancel, { once: true });
  });
}

export async function generateMaterialMedia(teacherId, path, libraryId, media, { signal, onProgress } = {}) {
  let data, progress;
  let retryBudget = 120_000;
  do {
    try {
      ({ data } = await studioRequest(teacherId, path, { method: "POST", signal }));
    } catch (error) {
      const delay = (error.retryAfterSeconds ?? 60) * 1000;
      if (!["reading", "slides"].includes(media) || error.status !== 429 || error.code !== "RATE_LIMITED" ||
          delay < 1000 || delay > retryBudget) throw error;
      retryBudget -= delay;
      onProgress?.({ ...progress, waiting: true });
      await waitForProvider(delay, signal);
      data = { status: "preparing" };
      continue;
    }
    if (data?.status === "preparing") {
      progress = data;
      onProgress?.(data);
    }
  } while (data?.status === "preparing");
  await preloadLessonImages(path, data, signal);
  if (media && data && !["failed", "uncertain"].includes(data.status)) {
    // The library summary can catch up independently of the saved output.
    void rememberMaterialMedia(teacherId, libraryId, [media]);
  }
  return data;
}
