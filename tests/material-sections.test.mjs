import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { materialSections } from "../apps/web/server/materials/sections.mjs";
import { createMaterialService } from "../apps/web/server/materials/service.mjs";
import { createMaterialReading } from "../apps/web/server/materials/reading.mjs";
import { testDatabase } from "./support/database.mjs";

function pdf(pages) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, index) => `${4 + index * 2} 0 R`).join(" ")}] >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  for (const [index, text] of pages.entries()) {
    const lines = text.split("\n").map(line => `(${line}) Tj T*`).join(" ");
    const stream = `BT /F1 5 Tf 5 TL 40 760 Td ${lines} ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + index * 2} 0 R >>`,
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    );
  }
  let body = "%PDF-1.4\n";
  const offsets = objects.map((object, index) => {
    const offset = body.length;
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return String(offset).padStart(10, "0") + " 00000 n \n";
  });
  return new Uint8Array(Buffer.from(body + `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets.join("") + `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${body.length}\n%%EOF\n`));
}

test("PDF sections isolate outputs and keep a single document in the library", async () => {
  const storage = await testDatabase();
  try {
    for (const migration of storage.migrations) await storage.migrate(migration);
    const db = storage.db;
    const [owner, other] = await Promise.all(["owner", "other"].map(name =>
      db.teacher.create({ data: { name, email: name + "@example.test" } })));
    const service = createMaterialService(db);
    const bytes = pdf(["Bab I Benih tumbuh. Tunas muncul.", "Bab II Air mengalir. Akar menyerap air.", "Bab III Cahaya matahari."]);
    const material = await service.create(owner.id, { title: "Modul IPAS" }, randomUUID(),
      { name: "ipas.pdf", mime: "application/pdf", bytes, size: bytes.byteLength });
    const pick = (first, last, userId = owner.id) => materialSections(db, userId, material.id, new URLSearchParams({ first, last }));
    const outline = await materialSections(db, owner.id, material.id);
    assert.deepEqual(outline.sections.map(({ first, last }) => [first, last]), [[1, 1], [2, 2], [3, 3]]);
    assert.equal((await pick(1, 3)).id, material.id);
    await assert.rejects(pick(1, 4), { code: "INVALID_PAGE_RANGE" });
    await assert.rejects(pick(1, 1, other.id), { status: 404 });
    const [first, second] = await Promise.all([pick(1, 1), pick(2, 2)]);
    assert.equal((await pick(1, 1)).id, first.id);
    assert.notEqual(first.id, second.id);
    assert.match((await service.get(owner.id, first.id)).text, /Benih/);
    assert.doesNotMatch((await service.get(owner.id, first.id)).text, /Akar/);
    assert.deepEqual((await service.list(owner.id, new URLSearchParams("view=all"))).data.map(row => row.id), [material.id]);
    const multi = await materialSections(db, owner.id, material.id, new URLSearchParams("range=3-3&range=1-1"));
    const combined = await service.get(owner.id, multi.id);
    assert.deepEqual(combined.sectionPages, [1, 3]);
    assert.match(combined.text, /Benih[\s\S]*Cahaya/);
    assert.doesNotMatch(combined.text, /Akar/);
    assert.equal((await materialSections(db, owner.id, material.id, new URLSearchParams("range=1-1&range=3-3"))).id, multi.id);
    const output = { title: "Benih", sections: [{ heading: "Benih tumbuh", paragraphs: ["Benih tumbuh. Tunas muncul."] }],
      quiz: [{ question: "Apa yang muncul?", options: ["Tunas", "Batu", "Pasir"], answerIndex: 0, explanation: "Tunas muncul." }],
    };
    const reading = createMaterialReading(db, async () => ({ content: output }));
    assert.deepEqual(await reading.generate(owner.id, first.id), output);
    assert.equal(await reading.get(owner.id, second.id), null);
    await assert.rejects(reading.get(other.id, first.id), { status: 404 });
    await service.patch(owner.id, material.id, { archived: true }, material.resourceVersion);
    await assert.rejects(reading.generate(owner.id, second.id), { code: "MATERIAL_ARCHIVED" });
    const archived = await service.get(owner.id, material.id);
    await service.remove(owner.id, material.id, archived.resourceVersion);
    await assert.rejects(service.get(owner.id, first.id), { status: 404 });
    const dense = pdf(Array.from({ length: 4 }, () => ("Teks materi. ".repeat(9) + "\n").repeat(130)));
    const long = await service.create(owner.id, { title: "PDF panjang" }, randomUUID(),
      { name: "panjang.pdf", mime: "application/pdf", bytes: dense, size: dense.byteLength });
    assert.equal(long.extractionError, "SOURCE_TEXT_TOO_LONG");
    const bounded = await materialSections(db, owner.id, long.id);
    assert.ok(bounded.sections.length > 1);
    assert.deepEqual(bounded.sections.flatMap(({ first, last }) => Array.from({ length: last - first + 1 }, (_, index) => first + index)), [1, 2, 3, 4]);
    for (const section of bounded.sections) {
      const choice = await materialSections(db, owner.id, long.id, new URLSearchParams({
        first: section.first, last: section.last,
      }));
      const ready = await service.get(owner.id, choice.id);
      assert.equal(ready.extractionStatus, "ready");
      assert.ok(ready.text.length <= 40000);
    }
    await assert.rejects(materialSections(db, owner.id, long.id, new URLSearchParams({ first: 1, last: 4 })), {
      code: "SOURCE_TEXT_TOO_LONG", message: "Maksimal 40.000 karakter teks per pilihan. Kurangi halaman atau bagian.",
    });
    await assert.rejects(materialSections(db, owner.id, long.id, new URLSearchParams({ first: 1, last: 3 })), { code: "SOURCE_TEXT_TOO_LONG" });
    const selected = await materialSections(db, owner.id, long.id, new URLSearchParams({ first: 2, last: 2 }));
    assert.equal((await service.get(owner.id, selected.id)).extractionStatus, "ready");
    const veryDenseBytes = pdf(Array.from({ length: 12 }, () => ("Teks materi. ".repeat(19) + "\n").repeat(130)));
    const veryDense = await service.create(owner.id, { title: "PDF sangat padat" }, randomUUID(), {
      name: "padat.pdf", mime: "application/pdf", bytes: veryDenseBytes, size: veryDenseBytes.length,
    });
    const manyParts = await materialSections(db, owner.id, veryDense.id);
    assert.ok(manyParts.sections.length > 9, "Keeping each choice usable takes priority over the nine-item preference");
    for (const section of manyParts.sections) {
      const choice = await materialSections(db, owner.id, veryDense.id, new URLSearchParams({ first: section.first, last: section.last }));
      assert.ok((await service.get(owner.id, choice.id)).text.length <= 40000);
    }
    const damaged = new Uint8Array(Buffer.from("%PDF-1.4\ntruncated"));
    const corrupt = await service.create(owner.id, { title: "PDF rusak" }, randomUUID(),
      { name: "rusak.pdf", mime: "application/pdf", bytes: damaged, size: damaged.byteLength });
    assert.equal(corrupt.extractionError, "SOURCE_TEXT_UNREADABLE");
    for (const range of [null, new URLSearchParams({ first: 1, last: 1 })]) {
      await assert.rejects(materialSections(db, owner.id, corrupt.id, range), { code: "SOURCE_TEXT_UNREADABLE", status: 422 });
    }
  } finally { await storage.close(); }
});
