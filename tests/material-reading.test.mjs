import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createMaterialReading } from "../apps/web/server/materials/reading.mjs";
import { createMaterialService } from "../apps/web/server/materials/service.mjs";
import { testDatabase } from "./support/database.mjs";

test("reading creation validates, serializes duplicate requests, and reopens only for its owner", async () => {
  const storage = await testDatabase();
  try {
    for (const migration of storage.migrations) await storage.migrate(migration);
    const [owner, other] = await Promise.all(["owner", "other"].map(name =>
      storage.db.teacher.create({ data: { name, email: name + "@example.test" } })));
    const materials = createMaterialService(storage.db);
    const source = await materials.create(owner.id, {
      title: "Fotosintesis", text: "Tumbuhan menggunakan cahaya untuk membuat gula.",
    }, randomUUID());
    const content = {
      title: "Fotosintesis",
      sections: [{ heading: "Cahaya", paragraphs: ["Tumbuhan memakai cahaya untuk membuat gula."] }],
      quiz: [{ question: "Apa yang dibuat tumbuhan?", options: ["Gula", "Garam", "Batu"], answerIndex: 0, explanation: "Tumbuhan membuat gula." }],
    };
    let calls = 0;
    const providerStarted = Promise.withResolvers();
    const providerFinished = Promise.withResolvers();
    const reading = createMaterialReading(storage.db, async (_feature, { messages }) => {
      assert.match(messages[1].content, /membuat gula/);
      calls++;
      if (calls === 1) return { content: { ...content, quiz: [{ ...content.quiz[0], answerIndex: 3 }] } };
      providerStarted.resolve();
      return providerFinished.promise;
    });

    assert.equal(await reading.get(owner.id, source.id), null);
    await assert.rejects(reading.get(other.id, source.id), { status: 404 });
    await assert.rejects(reading.generate(other.id, source.id), { status: 404 });
    await assert.rejects(reading.generate(owner.id, source.id), { code: "INVALID_READING" });
    assert.equal(await reading.get(owner.id, source.id), null);

    const generation = reading.generate(owner.id, source.id);
    try {
      await providerStarted.promise;
      await assert.rejects(reading.generate(owner.id, source.id), { code: "READING_IN_PROGRESS" });
    } finally { providerFinished.resolve({ content }); }
    assert.deepEqual(await generation, content);
    assert.deepEqual(await reading.get(owner.id, source.id), content);
    assert.deepEqual(await reading.generate(owner.id, source.id), content);
    assert.equal(calls, 2);

    const archived = await materials.create(owner.id, { title: "Arsip", text: "Sumber arsip." }, randomUUID());
    await materials.patch(owner.id, archived.id, { archived: true }, archived.resourceVersion);
    await assert.rejects(reading.generate(owner.id, archived.id), { code: "MATERIAL_ARCHIVED" });
  } finally { await storage.close(); }
});
