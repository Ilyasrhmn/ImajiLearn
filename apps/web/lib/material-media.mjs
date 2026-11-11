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

export async function generateMaterialMedia(teacherId, path, libraryId, media) {
  const { data } = await studioRequest(teacherId, path, { method: "POST" });
  await preloadLessonImages(path, data);
  if (media && data && !["failed", "uncertain"].includes(data.status)) {
    // The library summary can catch up independently of the saved output.
    void rememberMaterialMedia(teacherId, libraryId, [media]);
  }
  return data;
}
