import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createMaterialReading } from "../apps/web/server/materials/reading.mjs";
import { createReadingIllustration } from "../apps/web/server/materials/reading-illustration.mjs";
import { createMaterialService } from "../apps/web/server/materials/service.mjs";
import { testDatabase } from "./support/database.mjs";

test("an illustration is private, retryable, and generated once per saved reading", async () => {
  const storage = await testDatabase();
  try {
    for (const migration of storage.migrations) await storage.migrate(migration);
    const [owner, other] = await Promise.all(["owner", "other"].map(name =>
      storage.db.teacher.create({ data: { name, email: name + "@example.test" } })));
    const materials = createMaterialService(storage.db);
    const source = await materials.create(owner.id, {
      title: "Fotosintesis", text: "Tumbuhan menggunakan cahaya untuk membuat gula. SOURCE_ONLY",
    }, randomUUID());
    const content = {
      title: "Fotosintesis",
      sections: [{ heading: "Cahaya matahari", paragraphs: ["Tumbuhan membuat gula."] }],
      illustration: { sectionIndex: 0, paragraphIndex: 0, evidence: "Tumbuhan membuat gula.", scene: "A living plant with a green leaf as the main subject." },
      quiz: [{ question: "Apa yang dibuat tumbuhan?", options: ["Gula", "Garam", "Batu"], answerIndex: 0, explanation: "Tumbuhan membuat gula." }],
    };
    const reading = createMaterialReading(storage.db, async () => ({ content }));
    const bytes = Uint8Array.of(255, 216, 255, 217);
    const started = Promise.withResolvers();
    const finish = Promise.withResolvers();
    let calls = 0;
    const illustration = createReadingIllustration(storage.db, async prompt => {
      assert.match(prompt, /living plant with a green leaf/);
      assert.doesNotMatch(prompt, /SOURCE_ONLY|@example|Fotosintesis|Cahaya matahari|Tumbuhan membuat gula/);
      calls++;
      if (calls === 1) throw new Error("synthetic provider failure");
      if (calls === 3) throw new Error("replacement failed");
      if (calls === 4) return Uint8Array.of(255, 216, 1, 255, 217);
      started.resolve();
      return finish.promise;
    });

    await assert.rejects(illustration.generate(owner.id, source.id), { code: "READING_NOT_READY" });
    await reading.generate(owner.id, source.id);
    assert.equal(await illustration.get(owner.id, source.id), null);
    await assert.rejects(illustration.get(other.id, source.id), { status: 404 });
    await assert.rejects(illustration.generate(other.id, source.id), { status: 404 });
    await assert.rejects(illustration.generate(owner.id, source.id), /synthetic provider failure/);
    assert.deepEqual(await reading.get(owner.id, source.id), content);

    const pending = illustration.generate(owner.id, source.id);
    try {
      await started.promise;
      await assert.rejects(illustration.generate(owner.id, source.id), { code: "ILLUSTRATION_IN_PROGRESS" });
    } finally { finish.resolve(bytes); }
    assert.deepEqual(await pending, bytes);
    assert.deepEqual(await illustration.get(owner.id, source.id), bytes);
    assert.deepEqual(await illustration.generate(owner.id, source.id), bytes);
    assert.equal(calls, 2);
    await assert.rejects(illustration.generate(owner.id, source.id, true), /replacement failed/);
    assert.deepEqual(await illustration.get(owner.id, source.id), bytes);
    const replacement = await illustration.generate(owner.id, source.id, true);
    assert.notDeepEqual(replacement, bytes);
    assert.deepEqual(await illustration.get(owner.id, source.id), replacement);
  } finally { await storage.close(); }
});
