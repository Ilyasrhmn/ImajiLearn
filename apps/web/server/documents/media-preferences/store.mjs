import { parseMediaPreference } from "../../../../../packages/contracts/media-preferences.mjs";
import { ApiError } from "../../core/errors.mjs";
import { createMaterialService } from "../../materials/service.mjs";

function dto(materialId, row) {
  return { materialId, selectedMedia: row?.selectedMedia ?? [], songTemplateId: row?.songTemplateId ?? "balonku",
    resourceVersion: row?.resourceVersion ?? 0, updatedAt: row ? row.updatedAt.toISOString() : null };
}

export function createMediaPreferenceStore(database) {
  const materials = createMaterialService(database);
  return {
    get(userId, materialId) {
      return materials.withOwnedMaterial(userId, materialId, async (tx, material) => {
        const row = await tx.mediaPreference.findUnique({ where: { materialId_userId: { materialId: material.id, userId } } });
        return dto(material.id, row);
      });
    },
    async save(userId, materialId, body, expectedVersion) {
      const preference = parseMediaPreference(body);
      if (expectedVersion === undefined) throw new ApiError(428, "VERSION_REQUIRED", "Berikan versi preferensi terakhir.");
      if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw new ApiError(400, "INVALID_VERSION", "Versi preferensi tidak valid.");
      // Ownership and archive changes share the lock held by the materials module.
      return materials.withOwnedMaterial(userId, materialId, async (tx, material) => {
        if (material.archived) throw new ApiError(409, "MATERIAL_ARCHIVED", "Pulihkan materi untuk mengubah pilihan media.");
        const where = { materialId_userId: { materialId: material.id, userId } };
        const existing = await tx.mediaPreference.findUnique({ where });
        if ((existing?.resourceVersion ?? 0) !== expectedVersion) throw new ApiError(412, "RESOURCE_CHANGED", "Preferensi sudah berubah. Muat ulang sebelum menyimpan.");
        if (existing?.resourceVersion >= 2147483647) throw new ApiError(409, "VERSION_EXHAUSTED", "Versi preferensi sudah mencapai batas.");
        const row = existing
          ? await tx.mediaPreference.update({ where, data: { ...preference, resourceVersion: { increment: 1 } } })
          : await tx.mediaPreference.create({ data: { userId, materialId: material.id, ...preference } });
        return dto(material.id, row);
      });
    },
  };
}
