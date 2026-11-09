import { randomUUID } from "node:crypto";
import { createWorksheetCacheKey, createWorksheetDisplayOrder } from "./identity.mjs";
import { WorksheetValidationError, validateDisplayOrder, validateWorksheetContent, validateWorksheetPatch } from "./schema.mjs";

export class WorksheetVersionConflictError extends Error {
  constructor() {
    super("LKPD telah berubah. Muat ulang sebelum menyimpan kembali.");
    this.name = "WorksheetVersionConflictError";
    this.code = "WORKSHEET_VERSION_CONFLICT";
  }
}

export class WorksheetVersionExhaustedError extends RangeError {
  constructor() {
    super("Versi LKPD sudah mencapai batas.");
    this.name = "WorksheetVersionExhaustedError";
    this.code = "WORKSHEET_VERSION_EXHAUSTED";
  }
}

function requireString(value, field, max = Infinity) {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new WorksheetValidationError(field, "Metadata LKPD tidak sesuai.");
  }
}

function timestamp(clock) {
  const date = clock();
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new TypeError("Worksheet clock must return a valid Date.");
  }
  return date.toISOString();
}

// Internal factory: source and grade come from owned core material/profile snapshots.
// This creates a record only; the application must enforce layout acceptance and
// transactional quota before publishing it to the saved-document library.
export function createWorksheetRecord({ ownerId, source, templateId, grade, content }, clock = () => new Date()) {
  requireString(ownerId, "ownerId", 100);
  requireString(source?.id, "source.id", 100);
  requireString(source?.title, "source.title", 120);
  requireString(source?.revision, "source.revision");
  const cacheKey = createWorksheetCacheKey({ ownerId, sourceId: source.id, sourceRevision: source.revision, templateId, grade });
  const validated = validateWorksheetContent(content, templateId);
  const now = timestamp(clock);
  return {
    id: randomUUID(), ownerId, sourceMaterialId: source.id,
    source: { id: source.id, title: source.title, revision: source.revision },
    schemaVersion: 1, resourceVersion: 1, templateId, templateVersion: 1, assetVersion: 1,
    grade, language: "id", theme: "ink", content: validated,
    displayOrder: createWorksheetDisplayOrder(validated, templateId), cacheKey,
    createdAt: now, updatedAt: now,
  };
}

export function assertWorksheetVersion(record, expectedVersion) {
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    throw new WorksheetValidationError("resourceVersion", "Versi LKPD wajib berupa bilangan bulat positif.");
  }
  if (expectedVersion !== record.resourceVersion) throw new WorksheetVersionConflictError();
}

// The repository must compare-and-swap resourceVersion atomically in its transaction;
// this check alone does not protect against concurrent database writers.
export function applyWorksheetPatch(record, patch, expectedVersion, clock = () => new Date()) {
  assertWorksheetVersion(record, expectedVersion);
  if (record.resourceVersion >= 2147483647) throw new WorksheetVersionExhaustedError();
  const validated = validateWorksheetPatch(patch, record.templateId);
  if (validated.content) {
    const previousIds = record.content.items.map(item => item.id);
    const nextIds = validated.content.items.map(item => item.id);
    if (nextIds.length !== previousIds.length || nextIds.some((id, i) => id !== previousIds[i])) {
      throw new WorksheetValidationError("content.items", "Editor tidak dapat mengganti ID atau urutan kartu.");
    }
    validateDisplayOrder(record.displayOrder, nextIds);
  }
  if (!Number.isSafeInteger(record.resourceVersion + 1)) {
    throw new RangeError("Worksheet resource version exceeds the safe integer range.");
  }
  const updatedAt = timestamp(clock);
  if (updatedAt < record.updatedAt) throw new RangeError("Worksheet clock cannot move backwards.");
  return { ...structuredClone(record), ...validated, resourceVersion: record.resourceVersion + 1, updatedAt };
}

// The database relation is nullable; deleting a material leaves its snapshot intact.
export function detachWorksheetSource(record, materialId) {
  const copy = structuredClone(record);
  if (copy.sourceMaterialId === materialId) copy.sourceMaterialId = null;
  return copy;
}

export function toWorksheetDto(record) {
  const { id, source, schemaVersion, resourceVersion, templateId, templateVersion,
    assetVersion, grade, theme, content, displayOrder, createdAt, updatedAt, cacheKey } = record;
  return structuredClone({ id, source, schemaVersion, resourceVersion, templateId, templateVersion,
    assetVersion, grade, theme, content, displayOrder, createdAt, updatedAt, cacheKey });
}
