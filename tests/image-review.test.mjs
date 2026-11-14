import assert from "node:assert/strict";
import { test } from "node:test";
import { createImageReview } from "../apps/web/server/ai/providers/image-review.mjs";
import { createLessonImage } from "../apps/web/server/ai/providers/lesson-image.mjs";
import { resolveLessonIllustration } from "../apps/web/server/materials/lesson-illustration.mjs";
import { aiCorrection } from "../packages/shared/lib/ai-repair.mjs";
import { runWithAIRepair } from "../apps/web/server/ai/repair-context.mjs";
import { studioAIRequest } from "../packages/shared/lib/ai-request.mjs";

const png = Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.alloc(40)]);
const env = { KIE_API_KEY: "test", AI_TEXT_FALLBACK_API_KEY: "review-test", AI_TEXT_FALLBACK_MODEL: "gemini-3.1-flash-lite" };
const context = { title: "Trakea", lines: ["Trakea menyalurkan udara."] };
const verdict = accepted => Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ accepted, reason: accepted ? "Correct" : "Contains false labels" }) }] } }] });
const taskId = "a".repeat(32);

test("quality repair makes at most one automatic replacement across the web/PWA request client", async t => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => Response.json({ error: {
    code: ++calls === 1 ? "ILLUSTRATION_QUALITY_REJECTED" : "ILLUSTRATION_CONTENT_MISMATCH", message: "Wrong subject",
  } }, { status: 502 }));
  await assert.rejects(studioAIRequest("teacher", "/generate", { method: "POST" }), { code: "ILLUSTRATION_CONTENT_MISMATCH" });
  assert.equal(calls, 2);
});

test("review sends image and lesson only to the fixed review host, validates response and fails closed", async () => {
  const review = createImageReview(env, async (url, options) => {
    assert.match(url, /^https:\/\/generativelanguage.googleapis.com\//u);
    assert.equal(options.headers["x-goog-api-key"], "review-test");
    const parts = JSON.parse(options.body).contents[0].parts;
    assert.equal(parts[3].inlineData.data, png.toString("base64"));
    assert.equal(JSON.parse(parts[2].text).title, "Trakea");
    return verdict(false);
  });
  assert.equal((await review(png, context)).accepted, false);
  for (const response of [new Response("offline", { status: 429 }), Response.json({}), verdict("yes")]) {
    await assert.rejects(createImageReview(env, async () => response)(png, context), { code: "ILLUSTRATION_REVIEW_UNAVAILABLE" });
  }
});

test("review outage does not block an image or submit a second paid generation", async () => {
  let saved = taskId, posts = 0, fail = true;
  const generate = createLessonImage(env, async url => {
    if (String(url).includes("generativelanguage")) return fail ? new Response("quota", { status: 429 }) : verdict(true);
    if (String(url).includes("createTask")) { posts++; throw Error("Must not create another task"); }
    if (String(url).includes("recordInfo")) return Response.json({ code: 200, data: { taskId, state: "success", resultJson: JSON.stringify({ resultUrls: ["https://tempfile.aiquickdraw.com/image.png"] }) } });
    return new Response(png);
  });
  const task = () => ({ taskId: saved, reviewContext: context, onTask: async id => { saved = id; } });
  assert.deepEqual(await generate(null, task()), png);
  assert.equal(saved, taskId); fail = false;
  assert.deepEqual(await generate(null, task()), png); assert.equal(posts, 0);
});

test("an explicitly rejected completed image is not published and releases only that completed task", async () => {
  let saved = taskId;
  const generate = createLessonImage(env, async url => {
    if (String(url).includes("generativelanguage")) return verdict(false);
    if (String(url).includes("recordInfo")) return Response.json({ code: 200, data: { taskId, state: "success", resultJson: JSON.stringify({ resultUrls: ["https://tempfile.aiquickdraw.com/image.png"] }) } });
    return new Response(png);
  });
  await assert.rejects(generate(null, { taskId, reviewContext: context, onTask: async id => { saved = id; } }), { code: "ILLUSTRATION_QUALITY_REJECTED" });
  assert.equal(saved, null);
  assert.ok(aiCorrection("ILLUSTRATION_QUALITY_REJECTED"));
  await assert.rejects(runWithAIRepair(new Request("https://example.test/generate", { method: "POST", headers: { "X-AI-Repair": "ILLUSTRATION_QUALITY_REJECTED" } }),
    () => generate(null, { taskId, reviewContext: context })), { code: "ILLUSTRATION_CONTENT_MISMATCH" });
  assert.equal(aiCorrection("ILLUSTRATION_CONTENT_MISMATCH"), null, "A second rejection must not trigger another paid retry");
});

test("source figures keep their legitimate labels; resumed generated images still receive lesson review context", async () => {
  const input = { userId: "owner", source: { id: "source", title: "Pernapasan", text: "Trakea menyalurkan udara." },
    feature: "reading", title: "Trakea", lines: context.lines, sourceFigures: [{ caption: "Trachea", page: 4, bytes: png }] };
  const source = await resolveLessonIllustration({}, () => assert.fail("No planning needed"), () => assert.fail("No image provider needed"), input);
  assert.equal(source.sourcePage, 4);
  const resumed = await resolveLessonIllustration({}, () => assert.fail("No replanning needed"), async (prompt, task) => {
    assert.equal(prompt, null); assert.deepEqual(task.reviewContext, context); return png;
  }, { ...input, imageTask: { taskId } });
  assert.deepEqual(resumed.bytes, png);
});
