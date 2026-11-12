import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { testDatabase } from "./support/database.mjs";
import { createMaterialService } from "../apps/web/server/materials/service.mjs";
import { mediaLibrary, saveMediaDraft, finishMediaDraft } from "../apps/web/server/materials/media-library.mjs";

test("each media studio owns its drafts and results independently for the same source", async () => {
  const storage = await testDatabase();
  try {
    for (const migration of storage.migrations) await storage.migrate(migration);
    const db = storage.db;
    const owner = await db.teacher.create({ data: { name: "Guru", email: "owner@media-library.test" } });
    const other = await db.teacher.create({ data: { name: "Lain", email: "other@media-library.test" } });
    const source = await createMaterialService(db).create(owner.id, { title: "Lapisan bumi", text: "Bumi memiliki kerak, mantel, dan inti." }, randomUUID());
    for (const feature of ["reading", "slides", "song", "mindmap"]) {
      await saveMediaDraft(db, owner.id, source.id, feature);
      await saveMediaDraft(db, owner.id, source.id, feature);
      const list = await mediaLibrary(db, owner.id, feature, new URLSearchParams({ tab: "drafts" }));
      assert.equal(list.total, 1);
      assert.equal((await mediaLibrary(db, other.id, feature, new URLSearchParams({ tab: "drafts" }))).total, 0);
      await assert.rejects(saveMediaDraft(db, other.id, source.id, feature), { status: 404 });
    }
    assert.equal(await db.mediaDraft.count({ where: { userId: owner.id } }), 4);
    await db.materialSlideDeck.create({ data: { materialId: source.id, revision: source.revision, content: { title: "Lapisan bumi", slides: [{ title: "Kerak", points: ["Lapisan terluar."] }] }, generatedAt: new Date() } });
    // A text response alone is not a publishable slide deck.
    assert.equal((await mediaLibrary(db, owner.id, "slides", new URLSearchParams({ tab: "history" }))).total, 0);
    await db.materialSlideIllustration.create({ data: { materialId: source.id, revision: source.revision, slideIndex: 0, visualSkipped: true } });
    assert.equal((await mediaLibrary(db, owner.id, "slides", new URLSearchParams({ tab: "history" }))).total, 1);
    await finishMediaDraft(db, owner.id, source.id, "slides");
    assert.equal(await db.mediaDraft.count({ where: { userId: owner.id } }), 3);
    assert.equal((await mediaLibrary(db, owner.id, "song", new URLSearchParams({ tab: "drafts" }))).total, 1);
    await db.materialSong.create({ data: { materialId: source.id, revision: source.revision, status: "generating", attemptId: randomUUID(), content: { title: "Lagu bumi" } } });
    assert.equal((await mediaLibrary(db, owner.id, "song", new URLSearchParams({ tab: "drafts" }))).items[0].status, "preparing");
    assert.equal((await mediaLibrary(db, owner.id, "song", new URLSearchParams({ tab: "history" }))).total, 0);
    await db.materialSong.update({ where: { materialId_revision: { materialId: source.id, revision: source.revision } }, data: { status: "ready", audio: Uint8Array.of(1) } });
    assert.equal((await mediaLibrary(db, owner.id, "song", new URLSearchParams({ tab: "history" }))).total, 1);
    await assert.rejects(saveMediaDraft(db, owner.id, source.id, "unknown"), { status: 422 });
    await assert.rejects(mediaLibrary(db, owner.id, "unknown", new URLSearchParams()), { status: 422 });
  } finally { await storage.close(); }
});
