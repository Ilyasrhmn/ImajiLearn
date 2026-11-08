import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./support/database.mjs";
import { createMaterialService } from "../apps/web/server/materials/service.mjs";

let storage, store, materials, a, b, material, createMediaPreferenceStore;
async function newMaterial(owner = a) {
  return materials.create(owner.id, { title: "Synthetic source", text: "Materi tumbuhan." }, randomUUID());
}
before(async () => {
  ({ createMediaPreferenceStore } = await import("../apps/web/server/documents/media-preferences/store.mjs"));
  storage = await testDatabase();
  for (const name of storage.migrations) await storage.migrate(name);
  materials = createMaterialService(storage.db);
  store = createMediaPreferenceStore(storage.db);
  [a, b] = await Promise.all(["a", "b"].map(label => storage.db.teacher.create({ data: {
    name: `Synthetic Teacher ${label}`, email: `preference-${label}@example.test`, passwordHash: "synthetic-test-hash",
  } })));
  material = await newMaterial();
});
after(async () => { await storage?.close(); });

test("unsaved owned material reads default preferences without inserting a record", async () => {
  assert.deepEqual(await store.get(a.id, material.id), { materialId: material.id, selectedMedia: [], songTemplateId: "balonku", resourceVersion: 0, updatedAt: null });
  assert.equal(await storage.db.mediaPreference.count(), 0);
});

test("preferences persist across database connections, including empty selections and unselected song template", async () => {
  const saved = await store.save(a.id, material.id.toUpperCase(), { selectedMedia: ["song", "reading"], songTemplateId: "potong_bebek" }, 0);
  assert.equal(saved.materialId, material.id); assert.deepEqual(saved.selectedMedia, ["reading", "song"]);
  assert.equal(saved.resourceVersion, 1); assert.ok(Date.parse(saved.updatedAt)); assert.equal(saved.userId, undefined);
  const empty = await store.save(a.id, material.id, { selectedMedia: [], songTemplateId: "cicak_dinding" }, 1);
  assert.deepEqual(empty.selectedMedia, []); assert.equal(empty.songTemplateId, "cicak_dinding");
  assert.equal(empty.resourceVersion, 2);
  await storage.db.$disconnect();
  const fresh = storage.connect();
  try { assert.deepEqual(await createMediaPreferenceStore(fresh).get(a.id, material.id.toUpperCase()), empty); }
  finally { await fresh.$disconnect(); }
  const unchanged = await materials.get(a.id, material.id);
  assert.equal(unchanged.revision, material.revision); assert.equal(unchanged.resourceVersion, 1);
  assert.equal(unchanged.updatedAt, material.updatedAt);
});

test("shared media validation and stale writes leave persisted preference unchanged", async () => {
  const existing = await store.get(a.id, material.id);
  for (const body of [{ selectedMedia: ["reading", "reading"] }, { selectedMedia: ["video"] },
    { selectedMedia: null }, { selectedMedia: [], songTemplateId: "unknown" }, { selectedMedia: [], userId: b.id }]) {
    await assert.rejects(store.save(a.id, material.id, body, 2), { status: 422 });
  }
  await assert.rejects(store.save(a.id, material.id, { selectedMedia: ["slides"] }, 1), { status: 412 });
  await assert.rejects(store.save(a.id, material.id, { selectedMedia: [] }, undefined), { status: 428 });
  await assert.rejects(store.save(a.id, material.id, { selectedMedia: [] }, -1), { status: 400 });
  assert.deepEqual(await store.get(a.id, material.id), existing);
});

test("foreign and missing materials cannot be read or written, even with forged preference versions", async () => {
  for (const id of [material.id, randomUUID(), "invalid-id"]) {
    await assert.rejects(store.get(b.id, id), { status: 404 });
    await assert.rejects(store.save(b.id, id, { selectedMedia: ["reading"] }, 2), { status: 404 });
  }
  assert.equal(await storage.db.mediaPreference.count({ where: { userId: b.id } }), 0);
});

test("archive blocks saves while preserving readable preferences; restore permits new versions", async () => {
  await materials.patch(a.id, material.id, { archived: true }, 1);
  const archived = await store.get(a.id, material.id);
  assert.equal(archived.songTemplateId, "cicak_dinding");
  await assert.rejects(store.save(a.id, material.id, { selectedMedia: ["slides"] }, 2), { status: 409, code: "MATERIAL_ARCHIVED" });
  assert.deepEqual(await store.get(a.id, material.id), archived);
  await materials.patch(a.id, material.id, { archived: false }, 2);
  const saved = await store.save(a.id, material.id, { selectedMedia: ["slides"] }, 2);
  assert.equal(saved.resourceVersion, 3); assert.equal(saved.songTemplateId, "balonku");
});

test("every catalog media/template combination can be stored and version overflow is rejected", async () => {
  const source = await newMaterial();
  let version = 0;
  for (const songTemplateId of ["balonku", "cicak_dinding", "potong_bebek"]) {
    const saved = await store.save(a.id, source.id, { selectedMedia: ["reading", "mindmap", "slides", "song"], songTemplateId }, version++);
    assert.equal(saved.songTemplateId, songTemplateId);
  }
  await storage.db.mediaPreference.update({ where: { materialId: source.id }, data: { resourceVersion: 2147483647 } });
  await assert.rejects(store.save(a.id, source.id, { selectedMedia: [] }, 2147483647), { status: 409, code: "VERSION_EXHAUSTED" });
});

test("database constraints reject invalid media, templates, ownership, null arrays and versions", async () => {
  const source = await newMaterial();
  await store.save(a.id, source.id, { selectedMedia: ["reading"] }, 0);
  for (const [assignment, value, code] of [
    ['"selectedMedia" = $1::text[]', ["video"], "23514"],
    ['"selectedMedia" = $1::text[]', ["reading", "reading"], "23514"],
    ['"selectedMedia" = $1::text[]', [null], "23514"],
    ['"selectedMedia" = $1::text[]', null, "23502"],
    ['"songTemplateId" = $1', "unknown", "23514"],
    ['"userId" = $1::uuid', b.id, "23503"],
    ['"resourceVersion" = $1', 0, "23514"],
  ]) await assert.rejects(storage.sql(`UPDATE "MediaPreference" SET ${assignment} WHERE "materialId" = $2::uuid`, [value, source.id]), { code });
  assert.deepEqual((await store.get(a.id, source.id)).selectedMedia, ["reading"]);
});

test("preference migration preserves existing materials, revisions and teacher data", async () => {
  const upgrade = await testDatabase();
  try {
    const index = upgrade.migrations.findIndex(name => name.includes("media_preferences"));
    assert.ok(index > 0);
    for (const migration of upgrade.migrations.slice(0, index)) await upgrade.migrate(migration);
    const teacher = await upgrade.db.teacher.create({ data: { name: "Upgrade", email: "preference-upgrade@example.test", passwordHash: "synthetic-test-hash" } });
    const before = await createMaterialService(upgrade.db).create(teacher.id, { title: "Existing source", text: "Original text." }, randomUUID());
    for (const migration of upgrade.migrations.slice(index)) await upgrade.migrate(migration);
    assert.deepEqual(await createMaterialService(upgrade.db).get(teacher.id, before.id), before);
    assert.deepEqual(await upgrade.db.teacher.findUnique({ where: { id: teacher.id } }), teacher);
    assert.equal(await upgrade.db.mediaPreference.count(), 0);
  } finally { await upgrade.close(); }
});

test("PostgreSQL: simultaneous first saves create one preference and reject the stale write", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const source = await newMaterial();
  const results = await Promise.allSettled(["reading", "slides"].map(id => store.save(a.id, source.id, { selectedMedia: [id] }, 0)));
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(results.find(result => result.status === "rejected").reason.status, 412);
  assert.equal(await storage.db.mediaPreference.count({ where: { materialId: source.id } }), 1);
});

test("PostgreSQL: an in-flight save sees archive committed under the material lock", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const source = await newMaterial();
  let release, acquired;
  const locked = new Promise(resolve => { acquired = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const archive = materials.withOwnedMaterial(a.id, source.id, async (tx, row) => {
    acquired(); await gate;
    await tx.material.update({ where: { id: row.id }, data: { archived: true, resourceVersion: { increment: 1 }, updatedAt: new Date() } });
  });
  await locked;
  const save = store.save(a.id, source.id, { selectedMedia: ["song"] }, 0);
  release(); await archive;
  await assert.rejects(save, { status: 409, code: "MATERIAL_ARCHIVED" });
  assert.equal(await storage.db.mediaPreference.count({ where: { materialId: source.id } }), 0);
});
