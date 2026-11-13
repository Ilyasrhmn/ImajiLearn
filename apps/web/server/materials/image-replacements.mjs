import { ApiError } from "../core/errors.mjs";

export const IMAGE_REPLACEMENT_LIMIT = 3;
export function replacementStatus(used = 0) {
  return { used, limit: IMAGE_REPLACEMENT_LIMIT, remaining: Math.max(0, IMAGE_REPLACEMENT_LIMIT - used) };
}

export async function reserveImageReplacement(tx, model, key) {
  const result = await tx[model].updateMany({
    where: { ...key, imageReplacements: { lt: IMAGE_REPLACEMENT_LIMIT } },
    data: { imageReplacements: { increment: 1 } },
  });
  if (!result.count) throw new ApiError(409, "ILLUSTRATION_REPLACEMENT_LIMIT", "Batas 3 kali buat ulang ilustrasi untuk media ini sudah tercapai.");
}
