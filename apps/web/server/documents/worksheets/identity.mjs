import { createHash, randomInt } from "node:crypto";
import { TEMPLATE_CAPACITIES, WorksheetValidationError, validateWorksheetContent } from "./schema.mjs";

function cacheParts({ ownerId, sourceRevision, templateId, grade, language = "id" }) {
  if (typeof ownerId !== "string" || !ownerId.trim() || typeof sourceRevision !== "string" || !sourceRevision.trim() ||
    typeof templateId !== "string" || !Object.hasOwn(TEMPLATE_CAPACITIES, templateId) || typeof grade !== "string" || !/^(|[1-6])$/.test(grade) || language !== "id") {
    throw new WorksheetValidationError("cacheKey", "Metadata sumber LKPD tidak sesuai.");
  }
  return [ownerId, sourceRevision, templateId, 1, 1, grade, language];
}

// Call with trusted core snapshots, never with source metadata from a request body.
export function createWorksheetCacheKey(metadata) {
  const parts = cacheParts(metadata);
  if (typeof metadata.sourceId !== "string" || !metadata.sourceId.trim() || metadata.sourceId.length > 100) {
    throw new WorksheetValidationError("sourceId", "Identitas sumber LKPD tidak sesuai.");
  }
  return createHash("sha256").update(JSON.stringify([parts[0], metadata.sourceId, ...parts.slice(1)])).digest("hex");
}

// Read compatibility only. A legacy hit must also match the stored source ID.
export function legacyWorksheetCacheKey(metadata) {
  return createHash("sha256").update(JSON.stringify(cacheParts(metadata))).digest("hex");
}

// Persist this result once alongside the document; reads and edits reuse it.
export function createWorksheetDisplayOrder(content, templateId) {
  const validated = validateWorksheetContent(content, templateId);
  const ids = validated.items.map(item => item.id);
  const order = [...ids];
  if (["match", "sequence", "group"].includes(templateId)) {
    for (let i = order.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [order[i], order[j]] = [order[j], order[i]];
    }
    if (order.every((id, i) => id === ids[i])) order.push(order.shift());
  }
  return order;
}
