import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./support/database.mjs";
import { createSessionHandlers } from "../apps/web/server/accounts/sessions.mjs";
import { issueSession } from "../apps/web/server/accounts/session-issuer.mjs";
import { createMaterialService } from "../apps/web/server/materials/service.mjs";
import { createWorksheetRecord } from "../apps/web/server/documents/worksheets/document.mjs";
import { createWorksheetStorage } from "../apps/web/server/documents/worksheets/storage.mjs";
import { createWorksheetDocumentRepository } from "../apps/web/server/documents/worksheets/repository.mjs";
import { createWorksheetHandlers } from "../apps/web/server/documents/worksheets/http.mjs";
import { legacyWorksheetCacheKey } from "../apps/web/server/documents/worksheets/identity.mjs";

const origin = "http://localhost:3000";
let storage, internalStorage, materials, repository, api, a, b;
function content() {
  return { templateId: "fold", title: "Bagian tumbuhan", instructions: ["Buka kartu."],
    items: Array.from({ length: 4 }, (_, i) => ({ id: `card-${i}`, front: `Bagian ${i}`, back: "Penjelasan", assetId: null })),
    pairs: [], order: [], groups: [], teacher: { preparation: ["Siapkan kertas."], notes: "" } };
}
const request = (user = a) => new Request(`${origin}/internal-worksheet-storage`, { headers: user ? { cookie: user.cookie } : {} });
const command = material => ({ materialId: material.id, templateId: "fold", content: content() });
const context = id => ({ params: Promise.resolve({ id }) });
async function source(user = a) {
  return materials.create(user.id, { title: `Materi ${randomUUID()}`, text: "Materi sintetis tumbuhan." }, randomUUID());
}
async function account(label) {
  const teacher = await storage.db.teacher.create({ data: { name: `Synthetic ${label}`, email: `worksheet-sources-${label}@example.test`, passwordHash: "synthetic-test-hash", grade: "4" } });
  const issued = await storage.db.$transaction(tx => issueSession(tx, teacher.id, { secure: false, absoluteSeconds: 3600 }));
  return { id: teacher.id, cookie: issued.cookie.split(";")[0] };
}
before(async () => {
  storage = await testDatabase();
  for (const migration of storage.migrations) await storage.migrate(migration);
  a = await account("a"); b = await account("b");
  const { requireTeacher } = createSessionHandlers(storage.db, { origin });
  internalStorage = createWorksheetStorage({ database: storage.db, requireTeacher });
  materials = createMaterialService(storage.db);
  repository = createWorksheetDocumentRepository({ database: storage.db });
  api = createWorksheetHandlers({ repository, requireTeacher, origin });
});
after(async () => { await storage?.close(); });
beforeEach(async () => {
  await storage.db.worksheetDocument.deleteMany(); await storage.db.worksheetLibrary.deleteMany();
  await storage.db.material.deleteMany(); await storage.db.idempotency.deleteMany();
  await storage.db.teacher.update({ where: { id: a.id }, data: { grade: "4" } });
});

test("internal storage uses the core session, material lock reader and current teacher grade", async () => {
  assert.throws(() => createWorksheetStorage({ database: storage.db }), TypeError);
  const material = await source();
  await assert.rejects(() => internalStorage.storeDocument(request(null), command(material), material.revision), { status: 401 });
  const result = await internalStorage.storeDocument(request(), command(material), material.revision);
  assert.deepEqual(result.source, { id: material.id, title: material.title, revision: material.revision });
  assert.equal(result.grade, "4"); assert.equal(result.resourceVersion, 1);
  const row = await storage.db.worksheetDocument.findUnique({ where: { id: result.id } });
  assert.equal(row.sourceOwnerId, a.id); assert.equal(row.sourceMaterialId, material.id);
  assert.equal(Object.hasOwn(result, "sourceOwnerId"), false);
});

test("foreign, missing, archived and stale source snapshots cannot create documents", async () => {
  const own = await source(); const foreign = await source(b);
  for (const material of [foreign, { ...own, id: randomUUID() }]) {
    await assert.rejects(() => internalStorage.storeDocument(request(), command(material), material.revision), { code: "MATERIAL_NOT_FOUND" });
  }
  await assert.rejects(() => internalStorage.storeDocument(request(), command(own), "stale-server-revision"), { code: "SOURCE_CHANGED" });
  await materials.patch(a.id, own.id, { archived: true }, own.resourceVersion);
  await assert.rejects(() => internalStorage.storeDocument(request(), command(own), own.revision), { code: "SOURCE_NOT_READY" });
  assert.equal(await storage.db.worksheetDocument.count(), 0);
});

test("cache preserves edits and later profile changes do not mutate the earlier snapshot", async () => {
  const material = await source(); const first = await internalStorage.storeDocument(request(), command(material), material.revision);
  const patch = new Request(`${origin}/api/v1/worksheets/${first.id}`, { method: "PATCH",
    headers: { cookie: a.cookie, origin, "content-type": "application/json", "if-match": '"1"' }, body: JSON.stringify({ theme: "color" }) });
  assert.equal((await api.update(patch, context(first.id))).status, 200);
  const cached = await internalStorage.storeDocument(request(), command(material), material.revision);
  assert.equal(cached.id, first.id); assert.equal(cached.theme, "color"); assert.equal(cached.resourceVersion, 2);
  await storage.db.teacher.update({ where: { id: a.id }, data: { grade: "6" } });
  const next = await internalStorage.storeDocument(request(), command(material), material.revision);
  assert.equal(next.grade, "6"); assert.notEqual(next.id, first.id);
  const old = (await (await api.detail(request(), context(first.id))).json()).data;
  assert.equal(old.grade, "4"); assert.equal(old.theme, "color");
});

test("identical source text and titles do not share another material's cached document", async () => {
  const body = { title: "Materi kembar", text: "Teks identik." };
  const first = await materials.create(a.id, body, randomUUID());
  const second = await materials.create(a.id, body, randomUUID());
  assert.equal(first.revision, second.revision); assert.notEqual(first.id, second.id);
  const one = await internalStorage.storeDocument(request(), command(first), first.revision);
  const two = await internalStorage.storeDocument(request(), command(second), second.revision);
  assert.notEqual(one.id, two.id); assert.notEqual(one.cacheKey, two.cacheKey);
  assert.equal(one.source.id, first.id); assert.equal(two.source.id, second.id);
});

test("legacy cache lookup preserves edits only for the exact stored source identity", async () => {
  const body = { title: "Legacy cache", text: "Teks identik." };
  const first = await materials.create(a.id, body, randomUUID());
  const second = await materials.create(a.id, body, randomUUID());
  const old = createWorksheetRecord({ ownerId: a.id, source: first, templateId: "fold", grade: "4", content: content() });
  old.cacheKey = legacyWorksheetCacheKey({ ownerId: a.id, sourceRevision: first.revision, templateId: "fold", grade: "4" });
  old.theme = "color"; old.content.items[0].front = "Edit guru"; old.resourceVersion = 2;
  await repository.withTeacherTransaction(a.id, tx => tx.insertSaved(old));
  const other = await internalStorage.storeDocument(request(), command(second), second.revision);
  assert.notEqual(other.id, old.id); assert.equal(other.source.id, second.id);
  const cached = await internalStorage.storeDocument(request(), command(first), first.revision);
  assert.equal(cached.id, old.id); assert.equal(cached.cacheKey, old.cacheKey); assert.equal(cached.resourceVersion, 2);
  assert.equal(cached.content.items[0].front, "Edit guru"); assert.equal(cached.theme, "color");
});

test("database source deletion clears both live FK fields and preserves accepted document snapshots", async () => {
  const material = await source(); const result = await internalStorage.storeDocument(request(), command(material), material.revision);
  // Core's delete endpoint is outside B2; test the database deletion guarantee directly.
  await storage.db.material.delete({ where: { id: material.id } });
  const row = await storage.db.worksheetDocument.findUnique({ where: { id: result.id } });
  assert.equal(row.sourceMaterialId, null); assert.equal(row.sourceOwnerId, null); assert.equal(row.ownerId, a.id);
  assert.deepEqual((await (await api.detail(request(), context(result.id))).json()).data, result);
  await assert.rejects(() => internalStorage.storeDocument(request(), command(material), material.revision), { code: "MATERIAL_NOT_FOUND" });
});

test("database FK rejects a source owned by another teacher even if an internal caller bypasses service checks", async () => {
  const foreign = await source(b);
  const forged = createWorksheetRecord({ ownerId: a.id, source: foreign, templateId: "fold", grade: "4", content: content() });
  await assert.rejects(() => repository.withTeacherTransaction(a.id, tx => tx.insertSaved(forged)), { code: "P2003" });
  const own = await source(); const valid = await internalStorage.storeDocument(request(), command(own), own.revision);
  await assert.rejects(() => storage.db.worksheetDocument.update({ where: { id: valid.id }, data: { sourceOwnerId: b.id } }));
  assert.equal((await storage.db.worksheetDocument.findUnique({ where: { id: valid.id } })).sourceOwnerId, a.id);
});

test("PostgreSQL: source archive and document storage serialize on the core material lock", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const material = await source();
  const [saved, archived] = await Promise.allSettled([
    internalStorage.storeDocument(request(), command(material), material.revision),
    materials.patch(a.id, material.id, { archived: true }, 1),
  ]);
  assert.equal(archived.status, "fulfilled");
  if (saved.status === "rejected") assert.equal(saved.reason.code, "SOURCE_NOT_READY");
  else assert.equal(saved.value.source.revision, material.revision);
});

test("PostgreSQL: deleting a source during storage cannot leave a dangling relation", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const material = await source();
  const [saved, deleted] = await Promise.allSettled([
    internalStorage.storeDocument(request(), command(material), material.revision),
    storage.db.material.delete({ where: { id: material.id } }),
  ]);
  assert.equal(deleted.status, "fulfilled");
  if (saved.status === "rejected") assert.equal(saved.reason.code, "MATERIAL_NOT_FOUND");
  const rows = await storage.db.worksheetDocument.findMany();
  assert.ok(rows.every(row => row.sourceMaterialId === null && row.sourceOwnerId === null));
});

test("source FK upgrade preserves legacy snapshots while detaching missing and foreign live sources", async () => {
  const upgrade = await testDatabase();
  try {
    const index = upgrade.migrations.findIndex(name => name.endsWith("_worksheet_sources"));
    assert.ok(index > 0);
    for (const migration of upgrade.migrations.slice(0, index)) await upgrade.migrate(migration);
    const teachers = await Promise.all(["a", "b"].map(label => upgrade.db.teacher.create({ data: {
      name: `Synthetic Upgrade ${label}`, email: `worksheet-source-upgrade-${label}@example.test`, passwordHash: "synthetic-test-hash",
    } })));
    async function legacySource(userId, title, text) {
      const id = randomUUID(), revision = "a".repeat(64);
      await upgrade.db.$executeRaw`INSERT INTO "Material" ("id", "userId", "title", "text", "revision")
        VALUES (${id}::uuid, ${userId}::uuid, ${title}, ${text}, ${revision})`;
      return { id, title, revision };
    }
    const own = await legacySource(teachers[0].id, "Own", "Synthetic source");
    const foreign = await legacySource(teachers[1].id, "Foreign", "Other synthetic source");
    await upgrade.db.worksheetLibrary.create({ data: { ownerId: teachers[0].id } });
    const documents = [];
    for (const source of [own, { id: randomUUID(), title: "Deleted source", revision: randomUUID() }, foreign]) {
      const record = createWorksheetRecord({ ownerId: teachers[0].id, source, templateId: "fold", grade: "4", content: content() });
      const { source: snapshot, ...data } = record;
      await upgrade.db.worksheetDocument.create({ data: { ...data, sourceId: snapshot.id, sourceTitle: snapshot.title,
        sourceRevision: snapshot.revision, createdAt: new Date(record.createdAt), updatedAt: new Date(record.updatedAt) }, select: { id: true } });
      documents.push(record);
    }
    for (const migration of upgrade.migrations.slice(index)) await upgrade.migrate(migration);
    for (const [i, document] of documents.entries()) {
      const row = await upgrade.db.worksheetDocument.findUnique({ where: { id: document.id } });
      assert.equal(row.sourceMaterialId, i === 0 ? own.id : null);
      assert.equal(row.sourceOwnerId, i === 0 ? teachers[0].id : null);
      assert.equal(row.sourceId, document.source.id); assert.equal(row.sourceTitle, document.source.title);
      assert.equal(row.sourceRevision, document.source.revision); assert.equal(row.cacheKey, document.cacheKey);
      assert.deepEqual(row.content, document.content); assert.deepEqual(row.displayOrder, document.displayOrder);
      assert.equal(row.resourceVersion, document.resourceVersion);
    }
  } finally { await upgrade.close(); }
});
