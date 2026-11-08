import { WorksheetValidationError } from "./schema.mjs";

const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

function toRecord(row) {
  if (!row) return null;
  const { sourceId, sourceTitle, sourceRevision, createdAt, updatedAt, ...rest } = row;
  return { ...rest, source: { id: sourceId, title: sourceTitle, revision: sourceRevision },
    createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString() };
}

function toRow(record, ownerId) {
  if (record.ownerId !== ownerId) throw new TypeError("Worksheet owner does not match the transaction.");
  const { id, sourceMaterialId, source, schemaVersion, resourceVersion, templateId, templateVersion,
    assetVersion, grade, language, theme, content, displayOrder, cacheKey, createdAt, updatedAt } = record;
  return { id, ownerId, sourceMaterialId, sourceId: source.id, sourceTitle: source.title, sourceRevision: source.revision,
    schemaVersion, resourceVersion, templateId, templateVersion, assetVersion, grade, language, theme,
    content, displayOrder, cacheKey, createdAt: new Date(createdAt), updatedAt: new Date(updatedAt) };
}

/**
 * Prisma adapter for accepted worksheet documents. Core readers are mandatory,
 * transaction-aware functions: (prismaTransaction, ownerId, materialId) and
 * (prismaTransaction, ownerId). They must enforce ownership and coordinate source
 * archive/delete/revision changes in this transaction; there is no fallback reader.
 */
export function createWorksheetRepository({ database, getOwnedMaterial, getTeacherProfile }) {
  if (typeof database?.$transaction !== "function" || typeof getOwnedMaterial !== "function" || typeof getTeacherProfile !== "function") {
    throw new TypeError("Worksheet repository requires a Prisma database and transactional core readers.");
  }
  return repositoryFor(database, (tx, ownerId) => ({
    async getOwnedMaterial(id) { return uuid(id) ? getOwnedMaterial(tx, ownerId, id) : null; },
    async getTeacherProfile() { return getTeacherProfile(tx, ownerId); },
  }));
}

// Saved-document routes do not ingest sources and need no material/profile reader.
export function createWorksheetDocumentRepository({ database }) {
  if (typeof database?.$transaction !== "function") throw new TypeError("Worksheet repository requires a Prisma database.");
  return repositoryFor(database);
}

function repositoryFor(database, coreReaders) {
  return Object.freeze({
    async withTeacherTransaction(ownerId, action) {
      if (!uuid(ownerId) || typeof action !== "function") throw new TypeError("A teacher UUID and transaction callback are required.");
      return database.$transaction(async tx => {
        await tx.worksheetLibrary.createMany({ data: [{ ownerId }], skipDuplicates: true });
        // UPDATE obtains a row lock through commit, including when the library was
        // empty. Concurrent first inserts and quota checks share this owner lock.
        await tx.worksheetLibrary.update({ where: { ownerId }, data: { lockVersion: { increment: 1 } } });
        const port = Object.freeze({
          async getSaved(id) {
            return uuid(id) ? toRecord(await tx.worksheetDocument.findFirst({ where: { ownerId, id } })) : null;
          },
          async getSavedByCacheKey(cacheKey) {
            return toRecord(await tx.worksheetDocument.findUnique({ where: { ownerId_cacheKey: { ownerId, cacheKey } } }));
          },
          async listSaved({ limit, after }) {
            if (after && !uuid(after.id)) throw new WorksheetValidationError("cursor", "Cursor LKPD tidak sesuai.");
            const where = { ownerId };
            if (after) where.OR = [
              { updatedAt: { lt: new Date(after.updatedAt) } },
              { updatedAt: new Date(after.updatedAt), id: { lt: after.id } },
            ];
            const rows = await tx.worksheetDocument.findMany({ where, take: limit,
              orderBy: [{ updatedAt: "desc" }, { id: "desc" }] });
            return rows.map(toRecord);
          },
          async countSaved() { return tx.worksheetDocument.count({ where: { ownerId } }); },
          async insertSaved(record) {
            await tx.worksheetDocument.create({ data: toRow(record, ownerId) });
          },
          async replaceSaved(id, expectedVersion, record) {
            if (!uuid(id)) return false;
            if (record.ownerId !== ownerId || record.id !== id || record.resourceVersion !== expectedVersion + 1) {
              throw new TypeError("Worksheet update identity or version does not match the transaction.");
            }
            const result = await tx.worksheetDocument.updateMany({ where: { ownerId, id, resourceVersion: expectedVersion },
              data: { content: record.content, theme: record.theme, resourceVersion: record.resourceVersion, updatedAt: new Date(record.updatedAt) } });
            return result.count === 1;
          },
          async deleteSaved(id, expectedVersion) {
            if (!uuid(id)) return false;
            const result = await tx.worksheetDocument.deleteMany({ where: { ownerId, id, resourceVersion: expectedVersion } });
            return result.count === 1;
          },
          // Called by a transactional material-deletion integration, without
          // deleting accepted documents or changing their source snapshot.
          async detachSource(materialId) {
            if (!uuid(materialId)) return 0;
            const result = await tx.worksheetDocument.updateMany({ where: { ownerId, sourceMaterialId: materialId }, data: { sourceMaterialId: null } });
            return result.count;
          },
          ...coreReaders?.(tx, ownerId),
        });
        return action(port);
      }, { isolationLevel: "ReadCommitted", maxWait: 5000, timeout: 10000 });
    },
  });
}
