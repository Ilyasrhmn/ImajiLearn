import { ContractError } from "../../../../packages/contracts/validation.mjs";
import { ApiError } from "../core/errors.mjs";

const uuid = value => typeof value === "string" && /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value);
export const canonicalMaterialId = value => uuid(value) ? value.toLowerCase() : null;

export async function lockOwnedMaterial(tx, userId, id) {
  id = canonicalMaterialId(id);
  if (!id) return null;
  const locked = await tx.material.updateMany({ where: { id, userId }, data: { lockVersion: { increment: 1 } } });
  return locked.count ? tx.material.findFirst({ where: { id, userId } }) : null;
}

export function sourceSnapshot(row) {
  return { id: row.id, title: row.title, text: row.text, revision: row.revision, archived: row.archived, extractionStatus: row.extractionStatus, ...(row.parentId ? { parentId: row.parentId, pageStart: row.pageStart, pageEnd: row.pageEnd, sectionPages: row.sectionPages } : {}) };
}

// The caller's transaction must remain open through its source-dependent write.
export async function getOwnedMaterial(tx, userId, id) {
  const row = await lockOwnedMaterial(tx, userId, id);
  return row ? sourceSnapshot(row) : null;
}
export async function getOwnedMaterialIds(tx, userId, ids) {
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 100) throw new ContractError("Pilih 1–100 materi.");
  const canonical = ids.map(canonicalMaterialId);
  const missing = () => new ApiError(404, "MATERIAL_NOT_FOUND", "Materi tidak ditemukan.");
  if (canonical.includes(null)) throw missing();
  if (new Set(canonical).size !== canonical.length) throw new ContractError("ID materi tidak boleh berulang.");
  const owned = await tx.material.findMany({ where: { userId, id: { in: canonical } }, select: { id: true } });
  if (owned.length !== canonical.length) throw missing();
  return canonical;
}
