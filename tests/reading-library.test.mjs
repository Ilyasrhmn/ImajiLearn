import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { testDatabase } from "./support/database.mjs";
import { createMaterialService } from "../apps/web/server/materials/service.mjs";
import { mediaLibrary, saveMediaDraft, finishMediaDraft } from "../apps/web/server/materials/media-library.mjs";
import { digest } from "../apps/web/server/core/crypto.mjs";
const readingLibrary = (db, userId, params) => mediaLibrary(db, userId, "reading", params);
const saveReadingDraft = (db, userId, id) => saveMediaDraft(db, userId, id, "reading");
const finishReadingDraft = (db, userId, id) => finishMediaDraft(db, userId, id, "reading");

test("reading drafts survive reopening, preserve sections, stay private and move to history only when ready", async () => {
  const storage = await testDatabase();
  try {
    for (const migration of storage.migrations) await storage.migrate(migration);
    const db = storage.db;
    const owner = await db.teacher.create({ data: { name: "Owner", email: "owner@reading-library.test" } });
    const other = await db.teacher.create({ data: { name: "Other", email: "other@reading-library.test" } });
    const service = createMaterialService(db);
    const source = await service.create(owner.id, { title: "Sistem pernapasan", text: "Paru-paru menukar gas." }, randomUUID());
    const unused = await service.create(owner.id, { title: "Belum dipilih", text: "Akar menyerap air." }, randomUUID());
    const selection = await db.material.create({ data: { userId: owner.id, parentId: source.id, title: "Organ pernapasan",
      text: source.text, revision: digest("pages-4-11"), pageStart: 4, pageEnd: 11, sectionPages: [4, 5, 10, 11] } });
    const list = (tab = "drafts", extra = {}) => readingLibrary(db, owner.id, new URLSearchParams({ tab, ...extra }));
    assert.equal((await list()).items.length, 0);
    await saveReadingDraft(db, owner.id, source.id);
    await saveReadingDraft(db, owner.id, selection.id);
    await saveReadingDraft(db, owner.id, selection.id);
    const drafts = await list();
    assert.equal(drafts.items.length, 1);
    assert.equal(drafts.items[0].materialId, selection.id);
    assert.deepEqual(drafts.items[0].pages, [4, 5, 10, 11]);
    assert.equal(drafts.items[0].status, "draft");
    assert.ok(!drafts.items.some(item => item.materialId === unused.id));
    await assert.rejects(saveReadingDraft(db, other.id, selection.id), { status: 404 });
    assert.equal((await readingLibrary(db, other.id, new URLSearchParams())).items.length, 0);
    await assert.rejects(finishReadingDraft(db, other.id, selection.id), { status: 404 });
    const content = { title: "Cara kerja paru-paru", sections: [{ heading: "Alveolus" }] };
    await db.materialReading.create({ data: { materialId: selection.id, revision: selection.revision, content } });
    assert.equal((await list()).items[0].status, "incomplete");
    assert.equal((await list("history")).items.length, 0);
    await db.materialReadingIllustration.create({ data: { materialId: selection.id, revision: selection.revision, sectionIndex: 0, visualSkipped: true } });
    await db.materialReading.update({ where: { materialId_revision: { materialId: selection.id, revision: selection.revision } }, data: { generatedAt: new Date() } });
    assert.equal((await list()).items.length, 0);
    assert.equal((await list("history")).items[0].materialId, selection.id);
    assert.equal((await list("history", { q: "PARU" })).total, 1);
    assert.equal((await list("history", { q: "tidak cocok" })).total, 0);
    await saveReadingDraft(db, owner.id, source.id);
    await finishReadingDraft(db, owner.id, selection.id);
    assert.equal((await list()).items[0].materialId, source.id, "an older completion must not remove a newer selection");
    assert.equal((await list("history")).total, 1, "new work must not overwrite the previous result");
    await db.material.update({ where: { id: source.id }, data: { archived: true } });
    assert.equal((await list()).total, 0);
    assert.equal((await list("history")).total, 0);
    await assert.rejects(saveReadingDraft(db, owner.id, source.id), { status: 409 });
    await db.material.update({ where: { id: source.id }, data: { archived: false } });
    for (let index = 0; index < 11; index++) {
      const item = await service.create(owner.id, { title: `Latihan ${index}`, text: "Materi belajar." }, randomUUID());
      await saveReadingDraft(db, owner.id, item.id);
    }
    const first = await list();
    const second = await list("drafts", { page: "2" });
    assert.equal(first.items.length, 10);
    assert.equal(second.items.length, 2);
    assert.equal(first.counts.drafts, 12);
    assert.equal(new Set([...first.items, ...second.items].map(item => item.materialId)).size, 12);
    await assert.rejects(list("wrong"), { status: 422 });
    await db.material.delete({ where: { id: source.id } });
    assert.equal(await db.mediaDraft.count({ where: { rootId: source.id } }), 0);
  } finally { await storage.close(); }
});
