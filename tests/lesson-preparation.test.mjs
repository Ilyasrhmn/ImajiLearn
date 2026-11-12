import assert from "node:assert/strict";
import { test } from "node:test";
import { generateLessonParts } from "../apps/web/server/materials/lesson-content.mjs";
import { readPdfSourcePage } from "../apps/web/server/materials/pdf.mjs";
import { syntheticPdf } from "./support/pdf.mjs";
import { generateMaterialMedia } from "../apps/web/lib/material-media.mjs";

test("lesson chunks run with bounded concurrency and retain source order", async () => {
  let active = 0, peak = 0;
  const text = ["A", "B", "C"].map(letter => (letter + " ").repeat(2200)).join("\n");
  const output = await generateLessonParts({ text, title: "Materi" }, async chunk => {
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, chunk.startsWith("A") ? 15 : 1));
    active--;
    return chunk;
  }, parts => parts, async () => {});
  assert.equal(peak, 2);
  assert.equal(output.join(" ").replace(/\s+/g, " "), text.trim().replace(/\s+/g, " "));
});

test("a failed chunk waits for its peer before releasing the generation lease", async () => {
  let peerFinished = false;
  await assert.rejects(generateLessonParts({ text: "A ".repeat(2200) + "\n" + "B ".repeat(2200) }, async chunk => {
    if (chunk.startsWith("A")) throw new Error("provider unavailable");
    await new Promise(resolve => setTimeout(resolve, 10));
    peerFinished = true;
    return chunk;
  }, parts => parts, async () => {}), /provider unavailable/);
  assert.equal(peerFinished, true);
});

test("PDF source previews render the original page without rearranging text and figures", async () => {
  const page = await readPdfSourcePage(Buffer.from(syntheticPdf({ figure: true })), 1);
  assert.equal(page.page, 1);
  assert.equal(page.next, null);
  assert.equal(page.width, 1800);
  assert.equal(page.height, 1800);
  const bytes = Buffer.from(page.preview.split(",")[1], "base64");
  assert.equal(bytes.subarray(0, 3).toString("hex"), "ffd8ff");
  await assert.rejects(readPdfSourcePage(Buffer.from(syntheticPdf()), 2), { code: "SOURCE_PAGE_NOT_FOUND" });
});

test("the client advances preparation steps and returns only the completed lesson", async t => {
  const states = [{ status: "preparing", completed: 0, total: 2 },
    { status: "preparing", completed: 1, total: 2 }, { sections: [{ heading: "Akar" }] }];
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (_path, options) => {
    assert.equal(options.method, "POST");
    return Response.json({ data: states[calls++] });
  });
  const progress = [];
  const result = await generateMaterialMedia("teacher", "/materials/material/reading", "material", null,
    { onProgress: step => progress.push(step.completed) });
  assert.equal(calls, 3);
  assert.deepEqual(progress, [0, 1]);
  assert.deepEqual(result, states[2]);
});
