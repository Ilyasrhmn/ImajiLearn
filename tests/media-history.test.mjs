import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createMaterialService } from "../apps/web/server/materials/service.mjs";
import { createMaterialReading } from "../apps/web/server/materials/reading.mjs";
import { createPreparedLesson } from "../apps/web/server/materials/prepared-lesson.mjs";
import { createMaterialVisual } from "../apps/web/server/materials/visual.mjs";
import { materialMediaHistory } from "../apps/web/server/materials/media-history.mjs";
import { digest } from "../apps/web/server/core/crypto.mjs";
import { testDatabase } from "./support/database.mjs";

test("history groups saved media by source and feature without regenerating or exposing another teacher", async () => {
  const storage = await testDatabase();
  try {
    for (const migration of storage.migrations) await storage.migrate(migration);
    const db = storage.db;
    const [owner, other] = await Promise.all(["owner", "other"].map(name =>
      db.teacher.create({ data: { name, email: name + "@history.test" } })));
    const materials = createMaterialService(db);
    const folder = await db.folder.create({ data: { userId: owner.id, name: "IPAS", nameKey: "ipas" } });
    const source = await materials.create(owner.id, { title: "Tumbuhan", text: "Daun menangkap cahaya. Air masuk dari akar." }, randomUUID());
    const unrelated = await materials.create(owner.id, { title: "Matematika", text: "Sisi kubus." }, randomUUID());
    const otherSource = await materials.create(other.id, { title: "Materi guru lain", text: "Isi pribadi." }, randomUUID());
    await db.material.update({ where: { id: source.id }, data: { folderId: folder.id } });
    const makePart = (first, last, pages = []) => db.material.create({ data: {
      userId: owner.id, parentId: source.id, title: "Pilihan halaman", text: source.text,
      revision: digest(JSON.stringify([first, last, pages])), pageStart: first, pageEnd: last, sectionPages: pages,
    } });
    const [first, second] = await Promise.all([makePart(1, 3, [1, 3]), makePart(4, 5)]);
    const content = { title: "Daun dan akar", sections: [{ heading: "Cahaya", paragraphs: ["Daun menangkap cahaya."] }],
      quiz: [{ question: "Apa yang menangkap cahaya?", options: ["Daun", "Akar", "Batu"], answerIndex: 0, explanation: "Daun menangkap cahaya." }],
    };
    let calls = 0;
    const reading = createMaterialReading(db, async () => { calls++; return { content }; });
    const prepared = createPreparedLesson(db, reading, "reading", () => assert.fail("No image needed"),
      async (_feature, { messages }) => {
        const input = JSON.parse(messages[1].content);
        return { content: input.purpose === "illustration-routing"
          ? { sections: input.sections.map(({ index }) => ({ index, complexity: "simple", priority: 0 })) }
          : { generate: false, figureId: null } };
      });
    while ((await prepared.generate(owner.id, first.id)).status === "preparing") {}
    await reading.generate(owner.id, second.id);
    await reading.generate(owner.id, unrelated.id);
    await reading.generate(other.id, otherSource.id);
    const history = feature => materialMediaHistory(db, owner.id, source.id, new URLSearchParams({ feature }));
    const rows = await history("reading");
    assert.equal(rows.items.length, 2);
    const complete = rows.items.find(row => row.materialId === first.id);
    assert.equal(complete.status, "ready");
    assert.equal(complete.sourceTitle, "Tumbuhan");
    assert.equal(complete.folderName, "IPAS");
    assert.deepEqual(complete.pages, [1, 3]);
    assert.ok(complete.generatedAt);
    const incomplete = rows.items.find(row => row.materialId === second.id);
    assert.equal(incomplete.status, "incomplete");
    assert.equal(incomplete.generatedAt, null);
    const studioHistory = await materialMediaHistory(db, owner.id, null, new URLSearchParams({ feature: "reading" }));
    assert.equal(studioHistory.items.length, 3);
    assert.ok(studioHistory.items.some(row => row.materialId === unrelated.id));
    assert.ok(studioHistory.items.every(row => row.materialId !== otherSource.id));
    assert.equal(studioHistory.items.find(row => row.materialId === first.id).sourceTitle, "Tumbuhan");
    assert.equal(studioHistory.items.find(row => row.materialId === first.id).folderName, "IPAS");
    assert.equal(studioHistory.items.find(row => row.materialId === unrelated.id).folderName, null);
    assert.equal((await materialMediaHistory(db, owner.id, null, new URLSearchParams({ feature: "slides" }))).items.length, 0);
    await db.material.update({ where: { id: source.id }, data: { archived: true } });
    const activeHistory = await materialMediaHistory(db, owner.id, null, new URLSearchParams({ feature: "reading" }));
    assert.deepEqual(activeHistory.items.map(row => row.materialId), [unrelated.id]);
    await db.material.update({ where: { id: source.id }, data: { archived: false } });
    const otherHistory = await materialMediaHistory(db, other.id, null, new URLSearchParams({ feature: "reading" }));
    assert.deepEqual(otherHistory.items.map(row => row.materialId), [otherSource.id]);
    assert.deepEqual(await materialMediaHistory(db, owner.id, second.id, new URLSearchParams({ feature: "reading" })), rows);
    assert.equal((await history("slides")).items.length, 0);
    const before = calls;
    while ((await prepared.generate(owner.id, first.id)).status === "preparing") {}
    assert.equal(calls, before);
    assert.equal((await history("reading")).items.length, 2);
    await assert.rejects(materialMediaHistory(db, other.id, source.id, new URLSearchParams({ feature: "reading" })), { status: 404 });
    await assert.rejects(history("unknown"), { status: 422 });

    const visual = { kind: "photosynthesis", title: "Fotosintesis", steps: [
      { label: "Cahaya", detail: "Daun menangkap cahaya.", evidence: "Daun menangkap cahaya.", focus: "light" },
      { label: "Air", detail: "Air masuk dari akar.", evidence: "Air masuk dari akar.", focus: "water" },
    ] };
    await createMaterialVisual(db, async () => ({ content: visual })).generate(owner.id, first.id);
    assert.equal((await history("mindmap")).items[0].status, "ready");
    assert.ok((await history("mindmap")).items[0].generatedAt);
    await db.materialSong.create({ data: { materialId: first.id, revision: first.revision, status: "ready",
      attemptId: randomUUID(), content: { title: "Lagu tumbuhan" }, audio: Uint8Array.of(1) } });
    assert.equal((await history("song")).items[0].status, "ready");

    const parts = await Promise.all(Array.from({ length: 22 }, (_, index) => makePart(index + 6, index + 6)));
    for (const part of parts) await db.materialSlideDeck.create({ data: {
      materialId: part.id, revision: part.revision, content: { title: "Slide " + part.pageStart, slides: [{ title: "Daun", points: ["Daun menangkap cahaya."] }] },
    } });
    const pageOne = await history("slides");
    const pageTwo = await materialMediaHistory(db, owner.id, source.id, new URLSearchParams({ feature: "slides", offset: pageOne.nextOffset }));
    assert.equal(pageOne.items.length, 20);
    assert.equal(pageTwo.items.length, 2);
    assert.equal(new Set([...pageOne.items, ...pageTwo.items].map(row => row.materialId)).size, 22);
    const last = pageTwo.items.at(-1);
    await db.materialSlideDeck.update({ where: { materialId_revision: { materialId: last.materialId,
      revision: parts.find(part => part.id === last.materialId).revision } }, data: {
      content: { title: "Judul Langka", slides: [{ title: "Daun", points: ["Daun menangkap cahaya."] }] },
    } });
    const found = await materialMediaHistory(db, owner.id, source.id, new URLSearchParams({ feature: "slides", q: "judul langka" }));
    assert.deepEqual(found.items.map(item => item.materialId), [last.materialId]);
    assert.equal(found.nextOffset, null);
    const byFolder = await materialMediaHistory(db, owner.id, source.id, new URLSearchParams({ feature: "slides", q: "ipas" }));
    assert.equal(byFolder.items.length, 20);
    assert.equal(byFolder.nextOffset, 20);
    assert.equal((await materialMediaHistory(db, owner.id, source.id,
      new URLSearchParams({ feature: "reading", q: "Materi guru lain" }))).items.length, 0);
    await assert.rejects(materialMediaHistory(db, owner.id, source.id,
      new URLSearchParams({ feature: "reading", q: "x".repeat(201) })), { status: 422 });

  } finally { await storage.close(); }
});
