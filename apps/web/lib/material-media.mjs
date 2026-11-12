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

export async function generateMaterialMedia(teacherId, path, libraryId, media, { signal, onProgress } = {}) {
  let data;
  do {
    ({ data } = await studioRequest(teacherId, path, { method: "POST", signal }));
    if (data?.status === "preparing") onProgress?.(data);
  } while (data?.status === "preparing");
  await preloadLessonImages(path, data, signal);
  if (media && data && !["failed", "uncertain"].includes(data.status)) {
    // The library summary can catch up independently of the saved output.
    void rememberMaterialMedia(teacherId, libraryId, [media]);
  }
  return data;
}
