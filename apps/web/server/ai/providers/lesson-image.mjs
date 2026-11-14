import { createKieImage } from "./kie-image.mjs";
import { createCloudflareImage } from "./cloudflare-image.mjs";
import { ApiError } from "../../core/errors.mjs";
import { createImageReview } from "./image-review.mjs";
import { isImageQualityRetry } from "../repair-context.mjs";

export function createLessonImage(env = process.env, transport = fetch) {
  const zImage = createKieImage(env, transport);
  const cloudflare = createCloudflareImage(env, transport);
  const review = createImageReview(env, transport);
  return async (prompt, task = {}) => {
    let bytes;
    if (task.provider === "cloudflare" && !task.taskId) bytes = await cloudflare(prompt);
    else if (!task.provider || task.provider === "z-image") bytes = await zImage(prompt, task);
    else throw new ApiError(502, "INVALID_ILLUSTRATION_PLAN", "Layanan gambar tidak sesuai rencana. Coba lagi.");
    if (task.reviewContext) {
      let verdict;
      const relaxed = isImageQualityRetry();
      try { verdict = await review(bytes, { ...task.reviewContext, relaxed }); }
      catch (error) {
        if (error.code !== "ILLUSTRATION_REVIEW_UNAVAILABLE") throw error;
        // A secondary quality check must not trigger another paid generation or block a decoded image.
        console.warn("[illustration-review] Check unavailable; retaining generated image", { code: error.code });
        return bytes;
      }
      if (!verdict.accepted) {
        await task.onTask?.(null);
        throw new ApiError(502, relaxed ? "ILLUSTRATION_CONTENT_MISMATCH" : "ILLUSTRATION_QUALITY_REJECTED", "Objek ilustrasi belum sesuai materi. Coba lagi atau gunakan gambar sumber.");
      }
    }
    return bytes;
  };
}

export const generateIllustration = (prompt, task) => createLessonImage()(prompt, task);
