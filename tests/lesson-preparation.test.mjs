import assert from "node:assert/strict";
import { test } from "node:test";
import { generateLessonParts, generateLessonBatch } from "../apps/web/server/materials/lesson-content.mjs";
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


test("preparation waits for a text-provider rate limit and resumes saved progress", async t => {
  let posts = 0, timers = [];
  t.mock.method(globalThis, "setTimeout", (callback, milliseconds) => {
    timers.push(milliseconds); queueMicrotask(callback); return 0;
  });
  t.mock.method(globalThis, "fetch", async (_path, options) => {
    if (options.method !== "POST") return Response.json({ data: [] });
    posts++;
    if (posts === 1) return Response.json({ data: { status: "preparing", completed: 23, total: 34 } });
    if (posts === 2) return Response.json({ error: { code: "RATE_LIMITED", message: "Limit" } },
      { status: 429, headers: { "retry-after": "60" } });
    return Response.json({ data: { title: "Ready", slides: [] } });
  });
  const progress = [];
  const result = await generateMaterialMedia("teacher", "/materials/material/slides", "material", "slides",
    { onProgress: state => progress.push(state) });
  assert.equal(result.title, "Ready");
  assert.equal(posts, 3);
  assert.deepEqual(timers, [60_000]);
  assert.equal(progress[1].waiting, true);
  assert.equal(progress[1].completed, 23);
});

test("preparation bounds rate-limit waits and never retries uncertain or music requests", async t => {
  t.mock.method(globalThis, "setTimeout", callback => { queueMicrotask(callback); return 0; });
  let posts = 0, status = 429, code = "RATE_LIMITED";
  t.mock.method(globalThis, "fetch", async () => {
    posts++;
    return Response.json({ error: { code, message: "Blocked" } }, { status });
  });
  await assert.rejects(generateMaterialMedia("teacher", "/materials/material/slides", "material", "slides"), { status: 429 });
  assert.equal(posts, 3);
  posts = 0; status = 503; code = "PROVIDER_UNAVAILABLE";
  await assert.rejects(generateMaterialMedia("teacher", "/materials/material/slides", "material", "slides"), { status: 503 });
  assert.equal(posts, 1);
  posts = 0; status = 429; code = "RATE_LIMITED";
  await assert.rejects(generateMaterialMedia("teacher", "/materials/material/song", "material", "song"), { status: 429 });
  assert.equal(posts, 1);
});

test("canceling a rate-limit wait prevents a later generation request", async t => {
  const controller = new AbortController();
  let posts = 0;
  t.mock.method(globalThis, "setTimeout", () => {
    queueMicrotask(() => controller.abort(new DOMException("Canceled", "AbortError"))); return 0;
  });
  t.mock.method(globalThis, "fetch", async () => {
    posts++;
    return Response.json({ error: { code: "RATE_LIMITED", message: "Limit" } }, { status: 429 });
  });
  await assert.rejects(generateMaterialMedia("teacher", "/materials/material/slides", "material", "slides",
    { signal: controller.signal }), { name: "AbortError" });
  assert.equal(posts, 1);
});


test("reopening an active lesson waits for its existing generation lease", async t => {
  let posts = 0;
  t.mock.method(globalThis, "setTimeout", callback => { queueMicrotask(callback); return 0; });
  t.mock.method(globalThis, "fetch", async (_path, options) => {
    if (options.method !== "POST") return Response.json({ data: [] });
    if (++posts === 1) return Response.json({ error: { code: "READING_IN_PROGRESS", message: "Processing" } }, { status: 409 });
    return Response.json({ data: { title: "Ready", sections: [] } });
  });
  const result = await generateMaterialMedia("teacher", "/materials/material/reading", "material", "reading");
  assert.equal(result.title, "Ready");
  assert.equal(posts, 2);
});


test("incremental lesson splits truncated output into later bounded requests without losing text", async () => {
  const source = { title: "Long", text: "Air dan cahaya. ".repeat(180) };
  let calls = 0;
  const generate = async text => {
    calls++;
    if (text.length > 1500) throw Object.assign(new Error("truncated"), { code: "INCOMPLETE_OUTPUT" });
    return text;
  };
  let result = await generateLessonBatch(source, generate, parts => parts.join(" "));
  assert.equal(result.done, false);
  assert.equal(calls, 1);
  const state = JSON.parse(JSON.stringify(result.state));
  result = await generateLessonBatch(source, generate, parts => parts.join(" "), state);
  assert.equal(calls, 3);
  assert.equal(result.done, true);
  assert.equal(result.content.replace(/\s+/g, " ").trim(), source.text.trim());
});
