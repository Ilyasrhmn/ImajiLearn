import { createKieImage } from "./kie-image.mjs";
import { createCloudflareImage } from "./cloudflare-image.mjs";
import { ApiError } from "../../core/errors.mjs";

export function createLessonImage(env = process.env, transport = fetch) {
  const zImage = createKieImage(env, transport);
  const cloudflare = createCloudflareImage(env, transport);
  return async (prompt, task = {}) => {
    if (task.provider === "cloudflare" && !task.taskId) return cloudflare(prompt);
    if (!task.provider || task.provider === "z-image") return zImage(prompt, task);
    throw new ApiError(502, "INVALID_ILLUSTRATION_PLAN", "Layanan gambar tidak sesuai rencana. Coba lagi.");
  };
}

export const generateIllustration = (prompt, task) => createLessonImage()(prompt, task);
