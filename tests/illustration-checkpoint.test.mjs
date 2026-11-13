import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { testDatabase } from "./support/database.mjs";
import { createMaterialService } from "../apps/web/server/materials/service.mjs";
import { createMaterialReading } from "../apps/web/server/materials/reading.mjs";
import { createMaterialSlides } from "../apps/web/server/materials/slides.mjs";
import { createReadingIllustration } from "../apps/web/server/materials/reading-illustration.mjs";
import { createSlideIllustrations } from "../apps/web/server/materials/slide-illustrations.mjs";

test("illustration requests reject unfinished text checkpoints without calling a provider or reserving an image", async () => {
  const storage = await testDatabase();
  try {
    for (const migration of storage.migrations) await storage.migrate(migration);
    const db = storage.db;
    const owner = await db.teacher.create({ data: { name: "Guru", email: "checkpoint@example.test" } });
    const source = await createMaterialService(db).create(owner.id, {
      title: "Siklus air", text: "Air menguap karena panas matahari. ".repeat(360),
    }, randomUUID());
    const reading = createMaterialReading(db, async () => ({ content: {
      title: "Siklus air", sections: [{ heading: "Penguapan", paragraphs: ["Air menguap karena panas matahari."] }],
      quiz: [{ question: "Apa penyebab penguapan?", options: ["Panas", "Batu", "Pasir"], answerIndex: 0, explanation: "Panas matahari.", sectionIndex: 0 }],
    } }));
    const slides = createMaterialSlides(db, async () => ({ content: {
      title: "Siklus air", slides: [{ title: "Penguapan", points: ["Air menguap karena panas matahari."] }],
    } }));
    for (const service of [reading, slides]) {
      const state = await service.generate(owner.id, source.id, { incremental: true });
      assert.equal(state.status, "preparing");
      assert.ok(state.completed < state.total);
    }
    let calls = 0;
    const forbidden = async () => { calls++; throw new Error("Provider must not run"); };
    const readingImages = createReadingIllustration(db, forbidden, forbidden);
    const slideImages = createSlideIllustrations(db, forbidden, forbidden);
    await assert.rejects(readingImages.get(owner.id, source.id, 0, "status"), { status: 409, code: "READING_NOT_READY" });
    await assert.rejects(readingImages.generate(owner.id, source.id, false, 0), { status: 409, code: "READING_NOT_READY" });
    await assert.rejects(slideImages.generate(owner.id, source.id, source.revision, 0), { status: 409, code: "SLIDES_NOT_READY" });
    assert.equal(calls, 0);
    assert.equal(await db.materialReadingIllustration.count(), 0);
    assert.equal(await db.materialSlideIllustration.count(), 0);
  } finally { await storage.close(); }
});
