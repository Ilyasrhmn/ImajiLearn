import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createSlideIllustrations } from "../apps/web/server/materials/slide-illustrations.mjs";
import { parseLessonIndex } from "../apps/web/server/materials/lesson-illustration.mjs";
import { createMaterialSlides } from "../apps/web/server/materials/slides.mjs";
import { createMaterialService } from "../apps/web/server/materials/service.mjs";
import { testDatabase } from "./support/database.mjs";

test("slide generation validates and persists a deck for its owner", async () => {
  const storage = await testDatabase();
  try {
    for (const migration of storage.migrations) await storage.migrate(migration);
    const [owner, other] = await Promise.all(["owner", "other"].map(name =>
      storage.db.teacher.create({ data: { name, email: name + "@example.test" } })));
    const materials = createMaterialService(storage.db);
    const source = await materials.create(owner.id, {
      title: "Siklus air", text: "Air menguap dan kemudian menjadi awan.",
    }, randomUUID());
    const content = {
      title: "Siklus air",
      slides: [{ title: "Penguapan", points: ["Air menguap."] }, { title: "Awan", points: ["Uap air membentuk awan."] }],
    };
    const started = Promise.withResolvers(), finish = Promise.withResolvers();
    let calls = 0;
    const decks = createMaterialSlides(storage.db, async (feature, { messages }) => {
      assert.equal(feature, "slides");
      assert.match(messages[1].content, /Air menguap/);
      calls++;
      if (calls === 1) return { content: { ...content, slides: [{ title: "Penguapan", points: [] }] } };
      started.resolve();
      return finish.promise;
    });
    assert.equal(await decks.get(owner.id, source.id), null);
    await assert.rejects(decks.get(other.id, source.id), { status: 404 });
    await assert.rejects(decks.generate(other.id, source.id), { status: 404 });
    await assert.rejects(decks.generate(owner.id, source.id), { code: "INVALID_SLIDES" });
    const pending = decks.generate(owner.id, source.id);
    try {
      await Promise.race([started.promise, pending]);
      await assert.rejects(decks.generate(owner.id, source.id), { code: "SLIDES_IN_PROGRESS" });

    const sourceText = [
      "Tahap penguapan. " + "Air menerima panas matahari. ".repeat(160),
      "Tahap pengembunan. " + "Uap air menjadi butir air. ".repeat(160),
      "Tahap hujan. " + "Air jatuh dari awan ke bumi. ".repeat(160),
      "Konsep penyerapan. Air masuk ke dalam tanah.",
    ].join("\n\n");
    const longSource = await materials.create(owner.id, {
      title: "Siklus air lengkap", text: sourceText,
    }, randomUUID());
    const received = [];
    const longDecks = createMaterialSlides(storage.db, async (_, { messages }) => {
      const { text } = JSON.parse(messages[1].content);
      received.push(text);
      return { content: { title: "Siklus air", slides: Array.from({ length: 5 }, (_, index) => ({
        title: `Bagian ${received.length}, konsep ${index + 1}`,
        points: [text.trim().slice(-90)],
      })) } };
    });
    const expanded = await longDecks.generate(owner.id, longSource.id);
    assert.ok(expanded.slides.length > 10);
    const normalize = value => value.trim().replace(/\s+/g, " ");
    const ordered = [...received].sort((a, b) => sourceText.indexOf(a) - sourceText.indexOf(b));
    assert.ok(ordered.every(text => sourceText.includes(text)));
    assert.equal(normalize(ordered.join(" ")), normalize(sourceText));
    assert.deepEqual(expanded.slides.filter((_, index) => index % 5 === 0).map(slide => slide.points[0]), ordered.map(text => text.trim().slice(-90).trim()));
    assert.match(expanded.slides.at(-1).points[0], /penyerapan/);
    assert.deepEqual(await longDecks.get(owner.id, longSource.id), expanded);

    const images = createSlideIllustrations(storage.db, async () => Uint8Array.of(255, 216, 255, 217),
      async () => ({ content: { figureId: null, generate: true, subject: "Water", composition: "Central view", details: "A drop of water" } }));
    const slideIndex = parseLessonIndex("10");
    await images.generate(owner.id, longSource.id, longSource.revision, slideIndex);
    assert.deepEqual(await images.get(owner.id, longSource.id, longSource.revision, slideIndex), Uint8Array.of(255, 216, 255, 217));
    assert.ok(Number.isNaN(parseLessonIndex("2147483648")));
  } finally { finish.resolve({ content }); }
    assert.deepEqual(await pending, content);
    assert.deepEqual(await decks.get(owner.id, source.id), content);
    assert.deepEqual(await decks.generate(owner.id, source.id), content);
    assert.equal(calls, 2);
  } finally { await storage.close(); }
});
