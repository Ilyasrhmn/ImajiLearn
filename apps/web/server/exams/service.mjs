import { randomUUID } from "node:crypto";
import { ContractError, text } from "../../../../packages/contracts/validation.mjs";
import { copyRemedial, createExam, duplicateExam, EXAM_LIMIT, filterExams } from "../../lib/exams.mjs";
import { ApiError } from "../core/errors.mjs";
import { withIdempotency } from "../core/idempotency.mjs";
import { canonicalMaterialId, getOwnedMaterial } from "../materials/readers.mjs";
import { parseExamConfig, parseExamPatch } from "./contract.mjs";

const notFound = () => new ApiError(404, "EXAM_NOT_FOUND", "Naskah tidak ditemukan.");
const stale = () => new ApiError(412, "RESOURCE_CHANGED", "Data sudah berubah. Muat ulang sebelum menyimpan.");
const dto = row => ({ ...row.document, resourceVersion: row.resourceVersion });

async function ownExam(db, userId, id, includeSources = false) {
  const canonical = canonicalMaterialId(id);
  if (!canonical) throw notFound();
  const row = await db.examDocument.findFirst({ where: { id: canonical, userId },
    select: { document: true, resourceVersion: true, sourceSnapshots: includeSources } });
  if (!row) throw notFound();
  return row;
}

async function assertCapacity(tx, userId) {
  // Serialize quota checks across different idempotency keys for the same owner.
  await tx.$queryRaw`SELECT "id" FROM "Teacher" WHERE "id" = ${userId}::uuid FOR NO KEY UPDATE`;
  if (await tx.examDocument.count({ where: { userId } }) >= EXAM_LIMIT) {
    throw new ApiError(409, "EXAM_LIMIT_REACHED", "Pustaka naskah sudah penuh.");
  }
}

export function createExamService(db) {
  return {
    async create(teacher, body, key) {
      const config = parseExamConfig(body, teacher);
      const result = await withIdempotency(db, { userId: teacher.id, route: "POST /exams", key, payload: config }, async tx => {
        await assertCapacity(tx, teacher.id);
        const sources = new Map();
        for (const id of [...config.materialIds].sort()) {
          const source = await getOwnedMaterial(tx, teacher.id, id);
          if (!source) throw new ApiError(404, "MATERIAL_NOT_FOUND", "Materi tidak ditemukan.");
          if (source.archived) throw new ApiError(409, "MATERIAL_ARCHIVED", "Pulihkan materi sebelum membuat naskah.");
          if (source.extractionStatus !== "ready") throw new ApiError(409, "MATERIAL_NOT_READY", "Teks materi belum siap digunakan.");
          sources.set(id, source);
        }
        const document = createExam(config, teacher);
        const row = await tx.examDocument.create({ data: { id: document.id, userId: teacher.id, document,
          sourceSnapshots: config.materialIds.map(id => sources.get(id)) } });
        return dto(row);
      });
      if (result.deleted) throw notFound();
      return result;
    },
    async list(userId, params) {
      const keys = ["q", "grade", "subject", "sort"];
      if ([...params.keys()].some(key => !keys.includes(key) || params.getAll(key).length !== 1)) {
        throw new ContractError("Filter naskah tidak valid.");
      }
      const query = text(params.get("q") ?? "", "q", 120, { min: 0 });
      const grade = params.get("grade") ?? "";
      const subject = text(params.get("subject") ?? "", "subject", 100, { min: 0 });
      const sort = params.get("sort") ?? "newest";
      if ((grade && !/^[1-6]$/.test(grade)) || !["newest", "oldest", "name"].includes(sort)) {
        throw new ContractError("Filter naskah tidak valid.");
      }
      const rows = await db.$queryRaw`SELECT "document" - 'questions' AS "document", "resourceVersion"
        FROM "ExamDocument" WHERE "userId" = ${userId}::uuid ORDER BY "id" LIMIT ${EXAM_LIMIT}`;
      return filterExams(rows.map(dto), { query, grade, subject, sort });
    },
    async get(userId, id) { return dto(await ownExam(db, userId, id)); },
    async copy(userId, id, action, key) {
      const canonical = canonicalMaterialId(id);
      if (!canonical) throw notFound();
      const result = await withIdempotency(db, { userId, route: `POST /exams/:id/${action}`, key, payload: { id: canonical } }, async tx => {
        const source = await ownExam(tx, userId, canonical, true);
        await assertCapacity(tx, userId);
        const document = action === "remedial" ? copyRemedial(source.document) : duplicateExam(source.document);
        if (action === "remedial") {
          for (const question of document.questions) question.id = randomUUID();
        }
        const row = await tx.examDocument.create({ data: { id: document.id, userId, document, sourceSnapshots: source.sourceSnapshots } });
        return dto(row);
      });
      if (result.deleted) throw notFound();
      return result;
    },
    async patch(userId, id, body, version) {
      const row = await ownExam(db, userId, id);
      if (row.resourceVersion !== version) throw stale();
      if (version >= 2147483647) throw new ApiError(409, "VERSION_EXHAUSTED", "Versi naskah sudah mencapai batas.");
      const document = parseExamPatch(body, row.document);
      document.updatedAt = new Date().toISOString();
      const updated = await db.examDocument.updateMany({ where: { id: row.document.id, userId, resourceVersion: version },
        data: { document, resourceVersion: { increment: 1 } } });
      if (!updated.count) throw stale();
      return dto({ document, resourceVersion: version + 1 });
    },
    async remove(userId, id, version) {
      await db.$transaction(async tx => {
        const row = await ownExam(tx, userId, id);
        if (row.resourceVersion !== version) throw stale();
        const deleted = await tx.examDocument.deleteMany({ where: { id: row.document.id, userId, resourceVersion: version } });
        if (!deleted.count) throw stale();
        await tx.idempotency.updateMany({
          where: { userId, route: { in: ["POST /exams", "POST /exams/:id/duplicate", "POST /exams/:id/remedial"] },
            response: { path: ["id"], equals: row.document.id } },
          data: { response: { deleted: true } },
        });
      });
    },
  };
}
