import { Buffer } from "node:buffer";
import { applyWorksheetPatch, assertWorksheetVersion, createWorksheetRecord, toWorksheetDto, WorksheetVersionConflictError } from "./document.mjs";
import { WORKSHEET_LIMIT, WorksheetValidationError } from "./schema.mjs";

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
 * The adapter must lock the owner's document capacity and coordinate source reads
 * with material archive/delete/revision writes. All writes commit or roll back
 * together. Generation/layout approval belongs to the calling module.
 *
 * tx.getSaved(id), getSavedByCacheKey(key), listSaved({ limit, after }), countSaved()
 * operate only on accepted, saved documents belonging to that teacher.
 * listSaved orders by updatedAt DESC, id DESC and applies the cursor before limit.
 * replaceSaved(id, expectedVersion, record) and deleteSaved(id, expectedVersion)
 * return false on a failed atomic version comparison.
 *
 * Internal storage uses getOwnedMaterial(id), getTeacherProfile() and insertSaved(record).
 * Core material/profile reads must be scoped to the transaction's teacher.
 * Saved IDs and owner+cacheKey must be unique. Cache lookup only searches existing
 * saved documents; deleting one removes it from cache eligibility.
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

    // Internal storage command for the generation module after its approval checks.
    // expectedSourceRevision is the module's server snapshot, never a client field.
    // Not a public POST endpoint; no provider, job or layout lifecycle is implemented here.
    async storeDocument(request, command, expectedSourceRevision) {
      return withTeacher(request, async (tx, ownerId) => {
        const keys = ["materialId", "templateId", "content"];
        if (!command || typeof command !== "object" || Array.isArray(command) || Object.keys(command).length !== keys.length ||
          !keys.every(key => Object.hasOwn(command, key))) {
          throw new WorksheetValidationError("document", "Isian penyimpanan LKPD tidak sesuai.");
        }
        const { materialId, templateId, content } = command;
        const material = await tx.getOwnedMaterial(identifier(materialId));
        if (!material || material.id !== materialId) throw new WorksheetServiceError("MATERIAL_NOT_FOUND", "Materi tidak ditemukan.");
        if (typeof expectedSourceRevision !== "string" || !expectedSourceRevision.trim()) {
          throw new WorksheetValidationError("sourceRevision", "Snapshot revisi sumber dari server wajib tersedia.");
        }
        if (material.revision !== expectedSourceRevision) throw new WorksheetServiceError("SOURCE_CHANGED", "Materi telah berubah. Gunakan snapshot sumber terbaru.");
        if (material.archived !== false || material.extractionStatus !== "ready" || typeof material.text !== "string" || !material.text.trim()) {
          throw new WorksheetServiceError("SOURCE_NOT_READY", "Materi belum siap digunakan.");
        }
        const profile = await tx.getTeacherProfile();
        if (!profile) throw new TypeError("Core teacher profile is required for the worksheet snapshot.");
        const record = createWorksheetRecord({ ownerId, source: material, templateId, grade: profile.grade, content }, clock);
        const existing = await tx.getSavedByCacheKey(record.cacheKey);
        if (existing) return toWorksheetDto(owned(existing, ownerId));
        const saved = await tx.countSaved();
        if (!Number.isSafeInteger(saved) || saved < 0) throw new TypeError("Worksheet count must be a nonnegative integer.");
        if (saved >= WORKSHEET_LIMIT) throw new WorksheetServiceError("WORKSHEET_LIMIT_REACHED", "Maksimal 20 LKPD tersimpan.");
        await tx.insertSaved(record);
        return toWorksheetDto(record);
      });
    },
  });
}
