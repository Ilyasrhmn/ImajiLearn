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
      illustration: { sectionIndex: 0, paragraphIndex: 0, evidence: "Tumbuhan memakai cahaya untuk membuat gula.", scene: "A green leaf catching sunlight on a living plant." },
      quiz: [{ question: "Apa yang dibuat tumbuhan?", options: ["Gula", "Garam", "Batu"], answerIndex: 0, explanation: "Tumbuhan membuat gula." }],
    };
    let calls = 0;
    const providerStarted = Promise.withResolvers();
    const providerFinished = Promise.withResolvers();
    const reading = createMaterialReading(storage.db, async (_feature, { messages }) => {
      assert.match(messages[1].content, /membuat gula/);
      calls++;
      if (calls === 1) return { content: { ...content, quiz: [{ ...content.quiz[0], answerIndex: 3 }] } };
      if (calls === 2) return { content: { ...content, sections: [] } };
      providerStarted.resolve();
      return providerFinished.promise;
    });

    assert.equal(await reading.get(owner.id, source.id), null);
    await assert.rejects(reading.get(other.id, source.id), { status: 404 });
    await assert.rejects(reading.generate(other.id, source.id), { status: 404 });
    await assert.rejects(reading.generate(owner.id, source.id), { code: "INVALID_READING" });
    assert.equal(await reading.get(owner.id, source.id), null);

    await assert.rejects(reading.generate(owner.id, source.id), { code: "INVALID_READING" });
    const generation = reading.generate(owner.id, source.id);
    try {
      await providerStarted.promise;
      await assert.rejects(reading.generate(owner.id, source.id), { code: "READING_IN_PROGRESS" });
    } finally { providerFinished.resolve({ content }); }
    assert.deepEqual(await generation, content);
    assert.deepEqual(await reading.get(owner.id, source.id), content);
    assert.deepEqual(await reading.generate(owner.id, source.id), content);
    assert.equal(calls, 3);

    const fromPdf = await materials.create(owner.id, {
      title: "Tata Surya", text: "Planet-planet bergerak mengelilingi Matahari.",
    }, randomUUID());
    const planetReading = {
      title: "Tata Surya",
      sections: [{ heading: "Planet dan Matahari", paragraphs: ["Planet bergerak mengelilingi Matahari."] }],
      illustration: { sectionIndex: 0, paragraphIndex: 0, evidence: "Planet-planet mengelilingi Matahari.", scene: "Planets orbiting the Sun." },
      quiz: [{ question: "Apa yang dikelilingi planet?", options: ["Matahari", "Bulan", "Bumi"], answerIndex: 0, explanation: "Planet mengelilingi Matahari." }],
    };
    const normalized = await createMaterialReading(storage.db, async () => ({ content: planetReading })).generate(owner.id, fromPdf.id);
    assert.equal(normalized.illustration.evidence, planetReading.sections[0].paragraphs[0]);
    const withoutHint = await materials.create(owner.id, { title: "Planet", text: fromPdf.text }, randomUUID());
    const completeWithoutHint = await createMaterialReading(storage.db, async () => ({ content: {
      ...planetReading, illustration: { ...planetReading.illustration, paragraphIndex: 5 },
    } })).generate(owner.id, withoutHint.id);
    assert.equal(completeWithoutHint.illustration, undefined);
    assert.equal(completeWithoutHint.quiz.length, 1);

    const detailed = await materials.create(owner.id, {
      title: "Fotosintesis lengkap", text: "Cahaya, air, karbon dioksida, dan hasil fotosintesis.",
    }, randomUUID());
    const sections = ["Cahaya", "Air", "Karbon dioksida", "Hasil"].map(heading => ({
      heading, paragraphs: [`Bagian tentang ${heading}.`],
    }));
    sections[0].paragraphs.push("Daun menerima cahaya.", "Klorofil menangkap energi cahaya.", "Energi itu membantu tumbuhan membuat gula.");
    const detailedReading = createMaterialReading(storage.db, async () => ({ content: {
      ...content, sections,
      illustration: { ...content.illustration, sectionIndex: 3, evidence: sections[3].paragraphs[0] },
      quiz: [{ ...content.quiz[0], sectionIndex: 3 }],
    } }));
    const complete = await detailedReading.generate(owner.id, detailed.id);
    assert.equal(complete.sections.length, 4);
    assert.equal(complete.sections[0].paragraphs.length, 4);
    assert.equal(complete.illustration.sectionIndex, 3);
    assert.equal(complete.quiz[0].sectionIndex, 3);

    const archived = await materials.create(owner.id, { title: "Arsip", text: "Sumber arsip." }, randomUUID());
    await materials.patch(owner.id, archived.id, { archived: true }, archived.resourceVersion);
    await assert.rejects(reading.generate(owner.id, archived.id), { code: "MATERIAL_ARCHIVED" });
  } finally { await storage.close(); }
});
