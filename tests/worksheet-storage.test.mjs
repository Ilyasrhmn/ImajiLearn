import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./support/database.mjs";
import { createWorksheetRepository } from "../apps/web/server/documents/worksheets/repository.mjs";
import { createWorksheetService } from "../apps/web/server/documents/worksheets/service.mjs";
import { createWorksheetRecord } from "../apps/web/server/documents/worksheets/document.mjs";

const clock = () => new Date("2026-11-08T02:00:00.000Z");
function content() {
  return { templateId: "fold", title: "Bagian tumbuhan", instructions: ["Buka kartu."],
    items: Array.from({ length: 4 }, (_, i) => ({ id: `card-${i}`, front: `Bagian ${i}`, back: "Penjelasan", assetId: null })),
    pairs: [], order: [], groups: [], teacher: { preparation: ["Siapkan kertas."], notes: "" } };
}

test("worksheet migration upgrades the teacher foundation without changing existing data", async () => {
  const storage = await testDatabase();
  try {
    await storage.migrate(storage.migrations[0]);
    const teacher = await storage.db.teacher.create({ data: {
      name: "Synthetic Upgrade", email: "worksheet-upgrade@example.test", passwordHash: "synthetic-test-hash", grade: "5",
    } });
    for (const migration of storage.migrations.slice(1)) await storage.migrate(migration);
    assert.deepEqual(await storage.db.teacher.findUnique({ where: { id: teacher.id } }), teacher);
    assert.equal(await storage.db.worksheetDocument.count(), 0);
    assert.equal(await storage.db.worksheetLibrary.count(), 0);
  } finally { await storage.close(); }
});

test("worksheet Prisma repository persists B2 documents in PostgreSQL storage", async t => {
  const storage = await testDatabase();
  let fresh;
  try {
    for (const migration of storage.migrations) await storage.migrate(migration);
    const teachers = await Promise.all(["a", "b"].map(suffix => storage.db.teacher.create({ data: {
      name: `Synthetic Teacher ${suffix}`, email: `worksheet-${suffix}@example.test`, passwordHash: "synthetic-test-hash", grade: "4",
    } })));
    const [teacherA, teacherB] = teachers;
    const requests = teachers.map(teacher => ({ teacherId: teacher.id }));
    const sources = new Map();
    const coreReaders = {
      // Until the core materials module exists, only this test uses synthetic sources.
      getOwnedMaterial: async (tx, ownerId, id) => {
        assert.equal(typeof tx.teacher.findUnique, "function");
        return sources.get(`${ownerId}:${id}`) ?? null;
      },
      getTeacherProfile: (tx, ownerId) => tx.teacher.findUnique({ where: { id: ownerId }, select: { grade: true } }),
    };
    const repositoryFor = database => createWorksheetRepository({ database, ...coreReaders });
    const serviceFor = database => createWorksheetService({ repository: repositoryFor(database), clock,
      requireTeacher: async request => request?.teacherId ? { id: request.teacherId } : null });
    const repository = repositoryFor(storage.db);
    const service = serviceFor(storage.db);
    function fixture(ownerId = teacherA.id) {
      const source = { id: randomUUID(), title: "Sumber tumbuhan", revision: randomUUID(), archived: false, extractionStatus: "ready", text: "Materi tumbuhan." };
      sources.set(`${ownerId}:${source.id}`, source);
      const document = createWorksheetRecord({ ownerId, source, templateId: "fold", grade: "4", content: content() }, clock);
      return { source, document, command: { materialId: source.id, templateId: "fold", content: content() } };
    }
    async function seed(documents) {
      for (const ownerId of new Set(documents.map(document => document.ownerId))) {
        await repository.withTeacherTransaction(ownerId, async tx => {
          for (const document of documents.filter(item => item.ownerId === ownerId)) await tx.insertSaved(document);
        });
      }
    }
    t.beforeEach(async () => {
      await storage.db.worksheetDocument.deleteMany();
      await storage.db.worksheetLibrary.deleteMany();
      sources.clear();
    });

    await t.test("core readers are required, with no fallback to synthetic or unauthenticated data", () => {
      assert.throws(() => createWorksheetRepository({ database: storage.db }), TypeError);
    });

    await t.test("documents survive a new Prisma connection with full snapshots and metadata", async () => {
      const sample = fixture();
      const created = await service.storeDocument(requests[0], sample.command, sample.source.revision);
      fresh = storage.connect();
      assert.deepEqual(await serviceFor(fresh).get(requests[0], created.id), created);
      const persisted = await fresh.worksheetDocument.findUnique({ where: { id: created.id } });
      assert.equal(persisted.sourceMaterialId, sample.source.id);
      assert.equal(persisted.sourceRevision, sample.source.revision);
      assert.equal(persisted.ownerId, teacherA.id);
      await fresh.$disconnect(); fresh = undefined;
    });

    await t.test("all saved-document operations isolate two teachers and malformed IDs return not found", async () => {
      const sample = fixture(); await seed([sample.document]);
      for (const id of [sample.document.id, "opaque-missing-id", randomUUID()]) {
        await assert.rejects(() => service.get(requests[1], id), { code: "WORKSHEET_NOT_FOUND" });
        await assert.rejects(() => service.update(requests[1], id, { theme: "color" }, 1), { code: "WORKSHEET_NOT_FOUND" });
        await assert.rejects(() => service.remove(requests[1], id, 1), { code: "WORKSHEET_NOT_FOUND" });
      }
      assert.deepEqual(await service.list(requests[1]), { data: [], page: { nextCursor: null } });
      await assert.rejects(() => service.storeDocument(requests[1], sample.command, sample.source.revision), { code: "MATERIAL_NOT_FOUND" });
      assert.equal(await storage.db.worksheetDocument.count(), 1);
    });

    await t.test("pagination executes owner and cursor filtering before the database limit", async () => {
      const documents = Array.from({ length: 5 }, () => fixture().document);
      documents[0].updatedAt = "2026-11-08T02:01:00.000Z";
      await seed([...documents, fixture(teacherB.id).document]);
      const seen = []; let cursor;
      do {
        const page = await service.list(requests[0], { limit: 2, cursor });
        seen.push(...page.data.map(document => document.id)); cursor = page.page.nextCursor;
      } while (cursor);
      const expected = [...documents].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || (a.id < b.id ? 1 : -1)).map(document => document.id);
      assert.deepEqual(seen, expected);
      const invalid = Buffer.from(JSON.stringify([clock().toISOString(), "not-uuid"])).toString("base64url");
      await assert.rejects(() => service.list(requests[0], { cursor: invalid }), { code: "INVALID_WORKSHEET" });
    });

    await t.test("atomic versions reject a second edit or deletion from the old version", async () => {
      const sample = fixture(); await seed([sample.document]);
      const outcomes = await Promise.allSettled(["ink", "color"].map(theme => service.update(requests[0], sample.document.id, { theme }, 1)));
      assert.equal(outcomes.filter(item => item.status === "fulfilled").length, 1);
      assert.equal(outcomes.find(item => item.status === "rejected").reason.code, "WORKSHEET_VERSION_CONFLICT");
      assert.equal((await service.get(requests[0], sample.document.id)).resourceVersion, 2);
      await assert.rejects(() => service.remove(requests[0], sample.document.id, 1), { code: "WORKSHEET_VERSION_CONFLICT" });
      const stale = await repository.withTeacherTransaction(teacherA.id, async tx => ({
        update: await tx.replaceSaved(sample.document.id, 1, { ...sample.document, resourceVersion: 2 }),
        remove: await tx.deleteSaved(sample.document.id, 1),
      }));
      assert.deepEqual(stale, { update: false, remove: false });
    });

    await t.test("quota allows the twentieth document and rejects the twenty-first under concurrent calls", async () => {
      await seed(Array.from({ length: 19 }, () => fixture().document));
      const samples = [fixture(), fixture()];
      const outcomes = await Promise.allSettled(samples.map(sample => service.storeDocument(requests[0], sample.command, sample.source.revision)));
      assert.equal(outcomes.filter(item => item.status === "fulfilled").length, 1);
      assert.equal(outcomes.find(item => item.status === "rejected").reason.code, "WORKSHEET_LIMIT_REACHED");
      assert.equal(await storage.db.worksheetDocument.count({ where: { ownerId: teacherA.id } }), 20);
    });

    await t.test("cache hits return persisted teacher edits; deletion never resurrects on read", async () => {
      const sample = fixture();
      const first = await service.storeDocument(requests[0], sample.command, sample.source.revision);
      const edited = await service.update(requests[0], first.id, { theme: "color" }, 1);
      assert.deepEqual(await service.storeDocument(requests[0], sample.command, sample.source.revision), edited);
      await service.remove(requests[0], first.id, 2);
      await assert.rejects(() => service.get(requests[0], first.id), { code: "WORKSHEET_NOT_FOUND" });
      const next = await service.storeDocument(requests[0], sample.command, sample.source.revision);
      assert.notEqual(next.id, first.id);
    });

    await t.test("detaching a deleted source retains snapshots, content and cache in the database", async () => {
      const sample = fixture(); const other = fixture(teacherB.id);
      await seed([sample.document, other.document]);
      const count = await repository.withTeacherTransaction(teacherA.id, tx => tx.detachSource(sample.source.id));
      assert.equal(count, 1);
      sources.delete(`${teacherA.id}:${sample.source.id}`);
      assert.equal((await storage.db.worksheetDocument.findUnique({ where: { id: sample.document.id } })).sourceMaterialId, null);
      const saved = await service.get(requests[0], sample.document.id);
      assert.deepEqual(saved.source, sample.document.source); assert.deepEqual(saved.content, sample.document.content);
      assert.equal(saved.cacheKey, sample.document.cacheKey);
      assert.equal((await storage.db.worksheetDocument.findUnique({ where: { id: other.document.id } })).sourceMaterialId, other.source.id);
    });

    await t.test("rollback removes partial writes, allowing an explicit retry", async () => {
      const sample = fixture();
      await assert.rejects(() => repository.withTeacherTransaction(teacherA.id, async tx => {
        await tx.insertSaved(sample.document); throw new Error("Synthetic transaction failure");
      }), /Synthetic transaction failure/);
      assert.equal(await storage.db.worksheetDocument.count(), 0);
      await seed([sample.document]); assert.equal(await storage.db.worksheetDocument.count(), 1);
    });

    await t.test("database constraints enforce ownership references, cache uniqueness and document enums", async () => {
      const sample = fixture(); await seed([sample.document]);
      await assert.rejects(() => repository.withTeacherTransaction(teacherA.id, tx => tx.insertSaved({ ...sample.document, id: randomUUID() })), { code: "P2002" });
      for (const change of [{ theme: "dark" }, { templateId: "unknown" }, { grade: "7" }, { schemaVersion: 2 }]) {
        const invalid = fixture().document;
        await assert.rejects(() => repository.withTeacherTransaction(teacherA.id, tx => tx.insertSaved({ ...invalid, ...change })));
      }
      await assert.rejects(() => storage.db.teacher.delete({ where: { id: teacherA.id } }), { code: "P2003" });
      assert.equal(await storage.db.worksheetDocument.count(), 1);
    });
  } finally {
    await fresh?.$disconnect();
    await storage.close();
  }
});
