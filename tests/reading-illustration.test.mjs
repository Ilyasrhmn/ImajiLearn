import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createMaterialReading } from "../apps/web/server/materials/reading.mjs";
import { createReadingIllustration } from "../apps/web/server/materials/reading-illustration.mjs";
import { endpoint } from "../apps/web/server/core/http.mjs";
import { createMaterialService } from "../apps/web/server/materials/service.mjs";
import { testDatabase } from "./support/database.mjs";
import { syntheticPdf } from "./support/pdf.mjs";

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
      sections: [
        { heading: "Cahaya matahari", paragraphs: ["Tumbuhan membuat gula."] },
        { heading: "Air dari akar", paragraphs: ["Akar menyerap air dari tanah."] },
        { heading: "Oksigen", paragraphs: ["Daun melepaskan oksigen ke udara."] },
      ],
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
    }, async (_feature, { messages }) => {
      const { visualHint } = JSON.parse(messages[1].content);
      return { content: { figureId: null, generate: true, subject: visualHint, composition: "A leaf in a close-up view.", details: "The leaf is attached to a stem." } };
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
      const response = await endpoint(() => illustration.generate(owner.id, source.id))(new Request("http://localhost/illustration"));
      assert.equal(response.status, 409);
      assert.equal((await response.json()).error.code, "ILLUSTRATION_IN_PROGRESS");
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

    const chapterIllustrations = createReadingIllustration(storage.db, async prompt => {
      if (prompt.includes("Roots absorbing water")) return Uint8Array.of(1);
      assert.match(prompt, /Leaf releasing oxygen/);
      return Uint8Array.of(2);
    }, async (_feature, { messages }) => {
      const { lines } = JSON.parse(messages[1].content);
      return { content: {
        figureId: null, generate: true, subject: lines[0].startsWith("Akar") ? "Roots absorbing water" : "Leaf releasing oxygen",
        composition: "A close-up view.", details: "Show the relevant part of the plant.",
      } };
    });
    await assert.rejects(chapterIllustrations.get(other.id, source.id, 1), { status: 404 });
    await assert.rejects(chapterIllustrations.generate(owner.id, source.id, false, 3), { status: 404 });
    assert.equal(await chapterIllustrations.get(owner.id, source.id, 1), null);
    await chapterIllustrations.generate(owner.id, source.id, false, 1);
    await chapterIllustrations.generate(owner.id, source.id, false, 2);
    assert.deepEqual(await chapterIllustrations.get(owner.id, source.id, 0), replacement);
    assert.deepEqual(await chapterIllustrations.get(owner.id, source.id, 1), Uint8Array.of(1));
    assert.deepEqual(await chapterIllustrations.get(owner.id, source.id, 2), Uint8Array.of(2));

    const pdfSource = await materials.create(owner.id, { title: "Akar tumbuhan" }, randomUUID(), {
      name: "akar.pdf", mime: "application/pdf", size: syntheticPdf({ figure: true }).length,
      bytes: Buffer.from(syntheticPdf({ figure: true })),
    });
    await reading.generate(owner.id, pdfSource.id);
    const reuse = createReadingIllustration(storage.db, async () => {
      assert.fail("A matching source figure should bypass image generation");
    }, async (feature, { messages }) => {
      assert.equal(feature, "reading");
      const { figures, title } = JSON.parse(messages[1].content);
      assert.equal(title, "Air dari akar");
      assert.deepEqual(figures, [{ id: 1, page: 1, caption: "Gambar 1. Akar menyerap air." }]);
      return { content: { figureId: 1, generate: false } };
    });
    const original = await reuse.generate(owner.id, pdfSource.id, false, 1);
    assert.equal(Buffer.from(original).subarray(0, 3).toString("hex"), "ffd8ff");
    assert.ok(Buffer.from(await reuse.get(owner.id, pdfSource.id, 1)).equals(original));
    const stored = await storage.db.materialReadingIllustration.findUnique({
      where: { materialId_revision_sectionIndex: { materialId: pdfSource.id, revision: pdfSource.revision, sectionIndex: 1 } },
      select: { sourcePage: true },
    });
    assert.equal(stored.sourcePage, 1);

    let imageCalls = 0;
    let plans = 0;
    const selective = createReadingIllustration(storage.db, async () => {
      imageCalls++;
      return bytes;
    }, async (_feature, { messages }) => {
      plans++;
      const { title } = JSON.parse(messages[1].content);
      if (title === "Oksigen") return { content: { figureId: null, generate: false } };
      return { content: { figureId: title === "Air dari akar" ? 1 : null, generate: true, subject: "Roots absorbing water",
        composition: "Show a close-up below the soil.", details: "Show how water touches the fine roots." } };
    });
    assert.ok(Buffer.from(await selective.generate(owner.id, pdfSource.id, true, 1)).equals(original));
    assert.equal(imageCalls, 0);
    assert.deepEqual(await selective.get(owner.id, pdfSource.id, 1, "status"), { ready: true, skipped: false });
    assert.deepEqual(await selective.generate(owner.id, pdfSource.id, false, 0), bytes);
    assert.equal(await selective.generate(owner.id, pdfSource.id, false, 2), null);
    assert.equal(await selective.generate(owner.id, pdfSource.id, false, 2), null);
    assert.deepEqual(await selective.get(owner.id, pdfSource.id, 2, "status"), { ready: false, skipped: true });
    assert.equal(imageCalls, 1);
    assert.equal(plans, 2);
  } finally { await storage.close(); }
});
