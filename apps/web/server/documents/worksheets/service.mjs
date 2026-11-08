import { Buffer } from "node:buffer";
import { applyWorksheetPatch, assertWorksheetVersion, toWorksheetDto, WorksheetVersionConflictError } from "./document.mjs";
import { createWorksheetCacheKey } from "./identity.mjs";
import { WORKSHEET_LIMIT, WorksheetValidationError, validateDisplayOrder, validateWorksheetContent } from "./schema.mjs";

export class WorksheetServiceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "WorksheetServiceError";
    this.code = code;
  }
}

function notFound() {
  return new WorksheetServiceError("WORKSHEET_NOT_FOUND", "LKPD tidak ditemukan.");
}

function identifier(id) {
  if (typeof id !== "string" || !id.trim() || id.length > 100) {
    throw new WorksheetValidationError("id", "ID LKPD tidak sesuai.");
  }
  return id;
}

function owned(record, ownerId) {
  if (!record || record.ownerId !== ownerId) throw notFound();
  return record;
}

function encodeCursor(record) {
  return Buffer.from(JSON.stringify([record.updatedAt, record.id])).toString("base64url");
}

function decodeCursor(value) {
  if (value === undefined || value === null) return null;
  try {
    if (typeof value !== "string" || value.length > 512 || !/^[\w-]+$/.test(value)) throw new Error();
    const json = Buffer.from(value, "base64url").toString("utf8");
    if (Buffer.from(json).toString("base64url") !== value) throw new Error();
    const tuple = JSON.parse(json);
    if (!Array.isArray(tuple) || tuple.length !== 2 || typeof tuple[0] !== "string" ||
      new Date(tuple[0]).toISOString() !== tuple[0]) throw new Error();
    identifier(tuple[1]);
    return { updatedAt: tuple[0], id: tuple[1] };
  } catch {
    throw new WorksheetValidationError("cursor", "Cursor LKPD tidak sesuai.");
  }
}

/**
 * Repository port (no default or in-memory production implementation):
 * withTeacherTransaction(ownerId, callback) supplies a teacher-scoped transaction.
 * The adapter must lock the owner's saved documents AND generation reservations,
 * and coordinate source reads with material archive/delete/revision writes.
 * All writes and candidate consumption must commit or roll back together.
 *
 * tx.getSaved(id), getSavedByCacheKey(key), listSaved({ limit, after }), countSaved()
 * operate only on accepted, saved documents belonging to that teacher.
 * listSaved orders by updatedAt DESC, id DESC and applies the cursor before limit.
 * replaceSaved(id, expectedVersion, record) and deleteSaved(id, expectedVersion)
 * return false on a failed atomic version comparison.
 *
 * Publication additionally uses getCandidate(id), getOwnedMaterial(id),
 * countOtherReservations(candidateId), insertSaved(record), and
 * consumeCandidate(candidateId, resultId). Candidate layoutState/layoutVersion,
 * expiresAt and resultId are server-owned fields; they never come from a body.
 * countOtherReservations counts all live reservations except the current candidate.
 * Saved IDs and owner+cacheKey must be unique; consumed candidates are tombstoned
 * so a retry after document deletion cannot resurrect that document.
 */
export function createWorksheetService({ requireTeacher, repository, clock = () => new Date() }) {
  if (typeof requireTeacher !== "function" || typeof repository?.withTeacherTransaction !== "function" || typeof clock !== "function") {
    throw new TypeError("Worksheet service requires core authentication, a transactional repository, and a clock.");
  }

  async function withTeacher(request, action) {
    const teacher = await requireTeacher(request);
    if (!teacher || typeof teacher.id !== "string" || !teacher.id.trim() || teacher.id.length > 100) {
      throw new WorksheetServiceError("UNAUTHENTICATED", "Silakan masuk terlebih dahulu.");
    }
    return repository.withTeacherTransaction(teacher.id, tx => action(tx, teacher.id));
  }

  return Object.freeze({
    async list(request, { limit = 50, cursor } = {}) {
      return withTeacher(request, async (tx, ownerId) => {
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
          throw new WorksheetValidationError("limit", "Batas halaman harus 1–100.");
        }
        const records = await tx.listSaved({ limit: limit + 1, after: decodeCursor(cursor) });
        records.forEach(record => owned(record, ownerId));
        const page = records.slice(0, limit);
        return { data: page.map(toWorksheetDto), page: { nextCursor: records.length > limit ? encodeCursor(page.at(-1)) : null } };
      });
    },

    async get(request, id) {
      return withTeacher(request, async (tx, ownerId) => toWorksheetDto(owned(await tx.getSaved(identifier(id)), ownerId)));
    },

    async update(request, id, patch, expectedVersion) {
      return withTeacher(request, async (tx, ownerId) => {
        const record = owned(await tx.getSaved(identifier(id)), ownerId);
        const updated = applyWorksheetPatch(record, patch, expectedVersion, clock);
        if (!await tx.replaceSaved(id, expectedVersion, updated)) throw new WorksheetVersionConflictError();
        return toWorksheetDto(updated);
      });
    },

    async remove(request, id, expectedVersion) {
      return withTeacher(request, async (tx, ownerId) => {
        const record = owned(await tx.getSaved(identifier(id)), ownerId);
        assertWorksheetVersion(record, expectedVersion);
        if (!await tx.deleteSaved(id, expectedVersion)) throw new WorksheetVersionConflictError();
      });
    },

    // Internal publication boundary for the layout/job module. There is no public
    // create endpoint accepting client content, owner, source revision or cache key.
    async publishApprovedCandidate(request, candidateId, expectedVersion) {
      return withTeacher(request, async (tx, ownerId) => {
        const candidate = await tx.getCandidate(identifier(candidateId));
        if (!candidate || candidate.ownerId !== ownerId) throw notFound();
        const record = owned(candidate.record, ownerId);
        assertWorksheetVersion(record, expectedVersion);
        if (candidate.resultId) return toWorksheetDto(owned(await tx.getSaved(candidate.resultId), ownerId));
        if (record.schemaVersion !== 1 || record.templateVersion !== 1 || record.assetVersion !== 1 ||
          record.language !== "id" || !["ink", "color"].includes(record.theme)) {
          throw new WorksheetValidationError("candidate", "Versi atau tema kandidat LKPD tidak sesuai.");
        }
        if (candidate.layoutState !== "accepted" || candidate.layoutVersion !== record.resourceVersion) {
          throw new WorksheetServiceError("WORKSHEET_LAYOUT_REQUIRED", "LKPD belum lolos pemeriksaan layout untuk versi ini.");
        }
        const now = clock();
        const expiresAt = Date.parse(candidate.expiresAt);
        if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || !Number.isFinite(expiresAt)) {
          throw new TypeError("Candidate expiry and service clock must be valid timestamps.");
        }
        if (expiresAt <= now.getTime()) throw new WorksheetServiceError("WORKSHEET_CANDIDATE_EXPIRED", "Kandidat LKPD telah kedaluwarsa.");
        const material = await tx.getOwnedMaterial(record.sourceMaterialId);
        if (!material || material.id !== record.source.id) throw new WorksheetServiceError("MATERIAL_NOT_FOUND", "Materi tidak ditemukan.");
        if (material.archived !== false || material.extractionStatus !== "ready" || typeof material.text !== "string" || !material.text.trim()) {
          throw new WorksheetServiceError("SOURCE_NOT_READY", "Materi belum siap digunakan.");
        }
        if (material.revision !== record.source.revision) throw new WorksheetServiceError("SOURCE_CHANGED", "Materi telah berubah. Buat LKPD kembali.");
        const cacheKey = createWorksheetCacheKey({ ownerId, sourceRevision: material.revision, templateId: record.templateId, grade: record.grade });
        if (cacheKey !== record.cacheKey) throw new WorksheetValidationError("cacheKey", "Metadata kandidat LKPD tidak sesuai.");
        validateWorksheetContent(record.content, record.templateId);
        validateDisplayOrder(record.displayOrder, record.content.items.map(item => item.id));
        const existing = await tx.getSavedByCacheKey(cacheKey);
        if (existing) {
          owned(existing, ownerId);
          await tx.consumeCandidate(candidateId, existing.id);
          return toWorksheetDto(existing);
        }
        const saved = await tx.countSaved();
        const reserved = await tx.countOtherReservations(candidateId);
        if (![saved, reserved].every(value => Number.isSafeInteger(value) && value >= 0)) {
          throw new TypeError("Worksheet capacity counts must be nonnegative integers.");
        }
        if (saved + reserved >= WORKSHEET_LIMIT) throw new WorksheetServiceError("WORKSHEET_LIMIT_REACHED", "Maksimal 20 LKPD termasuk kapasitas yang sedang dipesan.");
        await tx.insertSaved(record);
        await tx.consumeCandidate(candidateId, record.id);
        return toWorksheetDto(record);
      });
    },
  });
}
