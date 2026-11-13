import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { testDatabase } from "./support/database.mjs";
import { createMaterialService } from "../apps/web/server/materials/service.mjs";
import { mediaLibrary, saveMediaDraft, finishMediaDraft } from "../apps/web/server/materials/media-library.mjs";
import { materialMediaHistory } from "../apps/web/server/materials/media-history.mjs";

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

test("history and library paginate compact current-revision results with bounded database transfers", async () => {
  const storage = await testDatabase();
  try {
    for (const migration of storage.migrations) await storage.migrate(migration);
    const db = storage.db;
    const owner = await db.teacher.create({ data: { name: "Guru", email: "bounded@media-library.test" } });
    const other = await db.teacher.create({ data: { name: "Lain", email: "private@media-library.test" } });
    const revision = "a".repeat(64);
    const ids = Array.from({ length: 113 }, () => randomUUID());
    await db.material.createMany({ data: ids.map((id, index) => ({ id, userId: owner.id,
      title: `Materi ${index}`, text: "Isi sumber", revision, archived: index === 112 })) });
    const foreign = await db.material.create({ data: { userId: other.id, title: "Pribadi", text: "Rahasia", revision } });
    const paragraph = "BODY_MUST_STAY_IN_DATABASE ".repeat(200);
    await db.materialReading.createMany({ data: [...ids, foreign.id].map((materialId, index) => ({ materialId, revision,
      content: { title: index < 105 ? `Hasil ${index}` : "Pengerjaan", sections: [{ heading: "Bagian", paragraphs: [paragraph] }] },
      generatedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
      leaseUntil: index === 110 ? new Date(Date.now() + 600_000) : null,
      leaseId: index === 110 ? randomUUID() : null,
    })) });
    await db.materialReading.create({ data: { materialId: ids[0], revision: "b".repeat(64),
      content: { title: "Revisi lama", sections: [{ heading: "Lama", paragraphs: [paragraph] }] } } });
    await db.materialReadingIllustration.createMany({ data: ids.slice(0, 105).map(materialId => ({ materialId, revision, sectionIndex: 0, visualSkipped: true })) });
    await db.mediaDraft.createMany({ data: [...ids.slice(0, 106), ids[110]].map((id, index) => ({ rootId: id, selectionId: id,
      userId: owner.id, feature: "reading", updatedAt: new Date(Date.UTC(2026, 1, 1, 0, 0, index)) })) });

    const transfers = [];
    const observe = async operation => {
      const result = await operation();
      if (Array.isArray(result)) transfers.push(result);
      return result;
    };
    const observed = new Proxy(db, { get(target, name) {
      if (name === "$queryRaw") return (...args) => observe(() => target.$queryRaw(...args));
      const value = target[name];
      if (value && typeof value.findMany === "function") return new Proxy(value, { get(model, method) {
        return method === "findMany" ? (...args) => observe(() => model.findMany(...args)) : model[method];
      } });
      return typeof value === "function" ? value.bind(target) : value;
    } });
    const history = await mediaLibrary(observed, owner.id, "reading", new URLSearchParams({ page: "99" }));
    assert.deepEqual(history.counts, { history: 105, drafts: 7 });
    assert.equal(history.total, 105);
    assert.equal(history.page, 11);
    assert.equal(history.items.length, 5);
    assert.deepEqual(history.items.map(item => item.materialId), ids.slice(0, 5).reverse());
    const drafts = await mediaLibrary(observed, owner.id, "reading", new URLSearchParams({ tab: "drafts" }));
    assert.deepEqual(drafts.items.map(item => item.materialId), [ids[110], ids[105], ids[111], ids[109], ids[108], ids[107], ids[106]]);
    assert.equal(drafts.items[0].status, "preparing");
    assert.equal(drafts.items[1].status, "incomplete");
    const search = await mediaLibrary(observed, owner.id, "reading", new URLSearchParams({ q: "hasil 10" }));
    assert.equal(search.total, 6);
    assert.deepEqual(search.counts, history.counts);
    const found = await materialMediaHistory(observed, owner.id, null, new URLSearchParams({ feature: "reading", q: "hasil 0" }));
    assert.deepEqual(found.items.map(item => item.materialId), [ids[0]]);
    assert.equal(found.nextOffset, null);
    await db.materialReading.updateMany({ data: { generatedAt: null } });
    await db.materialReading.update({ where: { materialId_revision: { materialId: ids[111], revision } },
      data: { content: { __lessonParts: { chunks: [{ text: paragraph, result: null }] } } } });
    const pending = await materialMediaHistory(observed, owner.id, null, new URLSearchParams({ feature: "reading" }), { all: true });
    assert.equal(pending.items.length, 112, "keyset pagination must retain rows with no generation date");
    assert.equal(new Set(pending.items.map(item => item.materialId)).size, 112);
    assert.equal(pending.items.find(item => item.materialId === ids[111]).status, "incomplete");
    await db.materialSong.createMany({ data: ids.slice(0, 112).map(materialId => ({ materialId, revision,
      status: "ready", attemptId: randomUUID(), audio: Uint8Array.of(1), updatedAt: new Date("2026-01-01T00:00:00Z"),
      content: { title: "Lagu", lyrics: paragraph },
    })) });
    const songs = await materialMediaHistory(observed, owner.id, null, new URLSearchParams({ feature: "song" }), { all: true });
    assert.equal(songs.items.length, 112, "song keyset pagination must retain equal timestamps");
    assert.equal(new Set(songs.items.map(item => item.materialId)).size, 112);
    assert.ok(songs.items.every(item => item.status === "ready"));
    assert.ok(transfers.every(rows => rows.length <= 100), "database result batches must stay bounded");
    assert.ok(transfers.every(rows => !JSON.stringify(rows).includes("BODY_MUST_STAY_IN_DATABASE")), "list queries must not transfer lesson bodies");
  } finally { await storage.close(); }
});
