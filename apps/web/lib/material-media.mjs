import { studioRequest } from "./studio-api.mjs";
import { studioAIRequest } from "@imajilearn/shared/lib/ai-request.mjs";
import { preloadLessonImages } from "./lesson-images.mjs";
import { isTemporaryAIError, waitForAI } from "@imajilearn/shared/lib/ai-wait.mjs";

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

export async function generateMaterialMedia(teacherId, path, libraryId, media, { signal, onProgress } = {}) {
  let data, progress;
  do {
    try {
      ({ data } = await studioAIRequest(teacherId, path, { method: "POST", signal,
        onRepair: state => onProgress?.({ ...progress, ...state }),
      }));
    } catch (error) {
      if (error.status === 409 && ["READING_IN_PROGRESS", "SLIDES_IN_PROGRESS", "LESSON_IN_PROGRESS", "VISUAL_IN_PROGRESS"].includes(error.code)) {
        onProgress?.({ ...progress, waiting: true });
        await waitForAI(signal);
        data = { status: "preparing" };
        continue;
      }
      if (!isTemporaryAIError(error)) throw error;
      onProgress?.({ ...progress, waiting: true });
      await waitForAI(signal, error.retryAfterSeconds ?? (error.status === 429 ? 60 : 5));
      data = { status: "preparing" };
      continue;
    }
    if (data?.status === "preparing") {
      progress = data;
      onProgress?.(data);
      if (data.retryAfterSeconds) await waitForAI(signal, data.retryAfterSeconds);
    }
  } while (data?.status === "preparing");
  await preloadLessonImages(path, data, signal);
  if (media && data && !["failed", "uncertain"].includes(data.status)) {
    // The library summary can catch up independently of the saved output.
    void rememberMaterialMedia(teacherId, libraryId, [media]);
  }
  return data;
}
