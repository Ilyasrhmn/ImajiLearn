import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
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
    } finally { finish.resolve({ content }); }
    assert.deepEqual(await pending, content);
    assert.deepEqual(await decks.get(owner.id, source.id), content);
    assert.deepEqual(await decks.generate(owner.id, source.id), content);
    assert.equal(calls, 2);
  } finally { await storage.close(); }
});
