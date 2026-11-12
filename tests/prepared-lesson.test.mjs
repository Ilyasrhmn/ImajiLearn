import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createPreparedLesson } from "../apps/web/server/materials/prepared-lesson.mjs";
import { createMaterialReading } from "../apps/web/server/materials/reading.mjs";
import { createMaterialSlides } from "../apps/web/server/materials/slides.mjs";
import { createMaterialService } from "../apps/web/server/materials/service.mjs";
import { syntheticPdf } from "./support/pdf.mjs";
import { testDatabase } from "./support/database.mjs";

test("a lesson stays hidden until every image is ready, resumes failures and reuses source figures", async () => {
  const storage = await testDatabase();
  const started = Promise.withResolvers(), release = Promise.withResolvers();
  try {
    for (const migration of storage.migrations) await storage.migrate(migration);
    const owner = await storage.db.teacher.create({ data: { name: "Guru", email: "prepared@example.test" } });
    const other = await storage.db.teacher.create({ data: { name: "Lain", email: "other@example.test" } });
    const bytes = Buffer.from(syntheticPdf({ figure: true }));
    const source = await createMaterialService(storage.db).create(owner.id, { title: "Tumbuhan" }, randomUUID(), {
      name: "tumbuhan.pdf", mime: "application/pdf", size: bytes.length, bytes,
    });
    const content = {
      title: "Tumbuhan",
      sections: [
        { heading: "Akar", paragraphs: ["Akar menyerap air."] },
        { heading: "Daun", paragraphs: ["Daun menangkap cahaya."] },
        { heading: "Ringkasan", paragraphs: ["Akar dan daun mempunyai fungsi berbeda."] },
      ],
      quiz: [{ question: "Bagian mana menyerap air?", options: ["Akar", "Daun", "Bunga"],
        answerIndex: 0, explanation: "Akar menyerap air." }],
    };
    let textCalls = 0, planCalls = 0, imageCalls = 0;
    const text = createMaterialReading(storage.db, async () => { textCalls++; return { content }; });
    const readyImage = Uint8Array.of(255, 216, 255, 217);
    const prepare = createPreparedLesson(storage.db, text, "reading", async () => {
      imageCalls++;
      if (imageCalls === 1) { started.resolve(); await release.promise; throw new Error("image service interrupted"); }
      return readyImage;
    }, async (_feature, { messages }) => {
      const input = JSON.parse(messages[1].content);
      if (input.purpose === "illustration-routing") return { content: { sections: input.sections.map(({ index }) => ({ index, complexity: "complex", priority: 50 })) } };
      planCalls++;
      const { title } = JSON.parse(messages[1].content);
      assert.notEqual(title, "Akar", "An exact caption match should not need an AI planner");
      return { content: title === "Ringkasan" ? { generate: false, figureId: null }
        : { figureId: null, generate: true, subject: "A leaf catching sunlight",
          composition: ["Close-up of a leaf", "Sunlight reaches its surface"], details: "A green leaf attached to a stem." } };
    });
    assert.equal(await prepare.get(owner.id, source.id), null);
    assert.equal((await prepare.generate(owner.id, source.id)).status, "preparing");
    const pending = prepare.generate(owner.id, source.id);
    try {
      await Promise.race([started.promise, pending]);
      assert.equal(await prepare.get(owner.id, source.id), null);
      await assert.rejects(prepare.generate(owner.id, source.id), { code: "LESSON_IN_PROGRESS" });
    } finally { release.resolve(); }
    await assert.rejects(pending, /image service interrupted/);
    assert.equal(await prepare.get(owner.id, source.id), null);
    const original = await storage.db.materialReadingIllustration.findFirst({
      where: { materialId: source.id, sectionIndex: 0 }, select: { sourcePage: true, bytes: true },
    });
    assert.equal(original.sourcePage, 1);
    assert.ok(original.bytes.length > 4);
    let result;
    do { result = await prepare.generate(owner.id, source.id); } while (result.status === "preparing");
    assert.deepEqual(result.illustrations, [
      { ready: true, skipped: false }, { ready: true, skipped: false }, { ready: false, skipped: true },
    ]);
    assert.equal(result.revision, source.revision);
    assert.deepEqual(await prepare.get(owner.id, source.id), result);
    assert.deepEqual(await prepare.generate(owner.id, source.id), result);
    await assert.rejects(prepare.get(other.id, source.id), { status: 404 });
    assert.equal(textCalls, 1);
    assert.equal(imageCalls, 2);
    assert.equal(planCalls, 3);

    const slides = {
      title: "Bagian tumbuhan",
      slides: Array.from({ length: 13 }, (_, index) => ({ title: "Bagian " + index, points: ["Akar menyerap air."] })),
    };
    const deck = createPreparedLesson(storage.db, createMaterialSlides(storage.db, async () => ({ content: slides })),
      "slides", async () => readyImage, async (_feature, { messages }) => {
        const input = JSON.parse(messages[1].content);
        return { content: input.purpose === "illustration-routing"
          ? { sections: input.sections.map(({ index }) => ({ index, complexity: "complex", priority: 50 })) }
          : { generate: false, figureId: null } };
      });
    const firstStep = await deck.generate(owner.id, source.id);
    assert.deepEqual(firstStep, { status: "preparing", completed: 0, total: 13 });
    assert.equal(await deck.get(owner.id, source.id), null);
    const secondStep = await deck.generate(owner.id, source.id);
    assert.deepEqual(secondStep, { status: "preparing", completed: 2, total: 13 });
    assert.equal(await deck.get(owner.id, source.id), null);
    let preparedDeck;
    do { preparedDeck = await deck.generate(owner.id, source.id); } while (preparedDeck.status === "preparing");
    assert.equal(preparedDeck.illustrations.length, 13);
    assert.ok(preparedDeck.illustrations.every(status => status.skipped));
    assert.deepEqual(await deck.get(owner.id, source.id), preparedDeck);
  } finally { release.resolve(); await storage.close(); }
});
