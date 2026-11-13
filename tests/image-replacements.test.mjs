import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { testDatabase } from "./support/database.mjs";
import { createMaterialService } from "../apps/web/server/materials/service.mjs";
import { createReadingIllustration } from "../apps/web/server/materials/reading-illustration.mjs";
import { createSlideIllustrations } from "../apps/web/server/materials/slide-illustrations.mjs";

test("image replacements share three attempts across sections, preserve originals after failure and isolate media types", async () => {
  const storage = await testDatabase();
  try {
    for (const migration of storage.migrations) await storage.migrate(migration);
    const db = storage.db;
    const owner = await db.teacher.create({ data: { name: "Guru", email: "replacements@example.test" } });
    const source = await createMaterialService(db).create(owner.id, { title: "Siklus air", text: "Air menguap dan menjadi hujan." }, randomUUID());
    const key = { materialId: source.id, revision: source.revision };
    await db.materialReading.create({ data: { ...key, content: { title: "Air", sections: [0, 1].map(i => ({ heading: `Air ${i}`, paragraphs: ["Air menguap."] })) } } });
    await db.materialSlideDeck.create({ data: { ...key, content: { title: "Air", slides: [0, 1].map(i => ({ title: `Air ${i}`, points: ["Air menguap."] })) } } });
    let calls = 0, fail = false;
    const generate = async () => { calls++; if (fail) throw new Error("provider failure"); return Uint8Array.of(255, 216, 255, 217); };
    const plan = async () => ({ content: { figureId: null, generate: true, subject: "A raindrop falling from a cloud.", composition: "One water cycle scene.", details: "Water falling toward the ground." } });
    const reading = createReadingIllustration(db, generate, plan);
    const slides = createSlideIllustrations(db, generate, plan);
    const run = (index, replace) => reading.generate(owner.id, source.id, replace, index, { budgeted: true });
    await run(0, false);
    assert.equal((await reading.get(owner.id, source.id, 0, "status")).replacements.used, 0);
    await run(0, true);
    await run(1, true);
    fail = true;
    await assert.rejects(run(0, true), /provider failure/);
    assert.deepEqual((await reading.get(owner.id, source.id, 0, "status")).replacements, { used: 3, limit: 3, remaining: 0 });
    assert.ok(await reading.get(owner.id, source.id, 0));
    const before = calls;
    await assert.rejects(run(1, true), { code: "ILLUSTRATION_REPLACEMENT_LIMIT", status: 409 });
    assert.equal(calls, before);
    fail = false;
    await slides.generate(owner.id, source.id, source.revision, 0, true, { budgeted: true });
    assert.equal((await slides.get(owner.id, source.id, source.revision, 0, "status")).replacements.used, 1);
    await Promise.all([0, 1].map(i => slides.generate(owner.id, source.id, source.revision, i, true, { budgeted: true })));
    await assert.rejects(slides.generate(owner.id, source.id, source.revision, 1, true, { budgeted: true }), { code: "ILLUSTRATION_REPLACEMENT_LIMIT" });
    assert.equal((await slides.get(owner.id, source.id, source.revision, 1, "status")).replacements.remaining, 0);
  } finally { await storage.close(); }
});
