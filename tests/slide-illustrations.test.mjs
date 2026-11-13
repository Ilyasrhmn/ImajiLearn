import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createMaterialService } from "../apps/web/server/materials/service.mjs";
import { createSlideIllustrations } from "../apps/web/server/materials/slide-illustrations.mjs";
import { createMaterialSlides } from "../apps/web/server/materials/slides.mjs";
import { testDatabase } from "./support/database.mjs";

test("slide images use scene descriptions and keep successful images across retries", async () => {
  const storage = await testDatabase();
  try {
    for (const migration of storage.migrations) await storage.migrate(migration);
    const [owner, other] = await Promise.all(["owner", "other"].map(name =>
      storage.db.teacher.create({ data: { name, email: name + "@example.test" } })));
    const source = await createMaterialService(storage.db).create(owner.id, {
      title: "Siklus air", text: "Sumber uji: penguapan dan hujan.",
    }, randomUUID());
    const deck = {
      title: "Siklus air",
      slides: [{ title: "Penguapan", points: ["Air menguap dari laut."] }, { title: "Hujan", points: ["Air jatuh dari awan."] }, { title: "Ringkasan", points: ["Siklus air berulang."] }],
    };
    await createMaterialSlides(storage.db, async () => ({ content: deck })).generate(owner.id, source.id);
    const bytes = [Uint8Array.of(255, 216, 255, 0, 255, 217), Uint8Array.of(255, 216, 255, 1, 255, 217)];
    const prompts = [];
    const ready = Promise.withResolvers(), release = Promise.withResolvers();
    let failed = false;
    const images = createSlideIllustrations(storage.db, async prompt => {
      prompts.push(prompt);
      assert.doesNotMatch(prompt, /Penguapan|Air menguap dari laut|Air jatuh dari awan/);
      if (prompt.includes("rising from the sea")) {
        ready.resolve();
        return release.promise;
      }
      assert.match(prompt, /raindrops falling from a cloud/);
      if (!failed) { failed = true; throw Error("synthetic failure"); }
      return bytes[1];
    }, async (_feature, { messages }) => {
      const { title } = JSON.parse(messages[1].content);
      if (title === "Ringkasan") return { content: { figureId: null, generate: false } };
      return { content: { figureId: null, generate: true, composition: "One central subject.",
        details: "Show water moving in the correct direction.",
        subject: title === "Penguapan" ? "Water vapor rising from the sea." : "Visible raindrops falling from a cloud.",
      } };
    });
    const args = [owner.id, source.id, source.revision];
    assert.equal(await images.get(...args, 0), null);
    await assert.rejects(images.get(other.id, source.id, source.revision, 0), { status: 404 });
    await assert.rejects(images.generate(...args, 3), { status: 404 });
    const first = images.generate(...args, 0);
    try {
      await Promise.race([ready.promise, first]);
      await assert.rejects(images.generate(...args, 0), { code: "ILLUSTRATION_IN_PROGRESS" });
    } finally { release.resolve(bytes[0]); }
    await first;
    await assert.rejects(images.generate(...args, 1), /synthetic failure/);
    assert.deepEqual(await images.get(...args, 0), bytes[0]);
    assert.equal(await images.get(...args, 1), null);
    await images.generate(...args, 1);
    assert.deepEqual(await images.get(...args, 0), bytes[0]);
    assert.deepEqual(await images.get(...args, 1), bytes[1]);
    assert.deepEqual(await images.get(...args, 0), bytes[0]);
    assert.deepEqual(await images.get(...args, 1), bytes[1]);
    await images.generate(...args, 0);
    assert.equal(prompts.length, 3);
    await images.generate(...args, 0, true);
    assert.equal(prompts.length, 4);
    await images.generate(...args, 2);
    await images.generate(...args, 2);
    assert.deepEqual(await images.get(...args, 2, "status"), { ready: false, skipped: true, replacements: { used: 1, limit: 3, remaining: 2 } });
    assert.deepEqual(await images.get(...args, 0), bytes[0]);
    assert.deepEqual(await images.get(...args, 1), bytes[1]);
    assert.equal(prompts.length, 4);
  } finally { await storage.close(); }
});
