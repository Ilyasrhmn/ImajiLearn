const uuid = value => typeof value === "string" && /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value);
export const canonicalMaterialId = value => uuid(value) ? value.toLowerCase() : null;

export async function lockOwnedMaterial(tx, userId, id) {
  id = canonicalMaterialId(id);
  if (!id) return null;
  const locked = await tx.material.updateMany({ where: { id, userId }, data: { lockVersion: { increment: 1 } } });
  return locked.count ? tx.material.findFirst({ where: { id, userId } }) : null;
}

export function sourceSnapshot(row) {
  return { id: row.id, title: row.title, text: row.text, revision: row.revision, archived: row.archived, extractionStatus: "ready" };
}

// The caller's transaction must remain open through its source-dependent write.
export async function getOwnedMaterial(tx, userId, id) {
  const row = await lockOwnedMaterial(tx, userId, id);
  return row ? sourceSnapshot(row) : null;
}
