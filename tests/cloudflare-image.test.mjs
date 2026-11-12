import assert from "node:assert/strict";
import { test } from "node:test";
import { createCloudflareImage } from "../apps/web/server/ai/providers/cloudflare-image.mjs";
import { createLessonImage } from "../apps/web/server/ai/providers/lesson-image.mjs";

const env = { CLOUDFLARE_ACCOUNT_ID: "a".repeat(32), CLOUDFLARE_API_TOKEN: "private-token" };
const png = Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.alloc(40)]);

test("Cloudflare uses the fixed model and returns validated image bytes", async () => {
  const generate = createCloudflareImage(env, async (url, request) => {
    assert.match(url, /\/ai\/run\/@cf\/black-forest-labs\/flux-1-schnell$/);
    assert.equal(request.headers.Authorization, "Bearer private-token");
    assert.equal(request.redirect, "error");
    assert.deepEqual(JSON.parse(request.body), { prompt: "A leaf", steps: 4 });
    return Response.json({ success: true, result: { image: png.toString("base64") } });
  });
  assert.deepEqual(await generate("A leaf"), png);
});

test("Cloudflare quota, malformed images and missing credentials fail without leaking secrets", async () => {
  await assert.rejects(createCloudflareImage({})("A leaf"), { code: "ILLUSTRATION_UNAVAILABLE" });
  await assert.rejects(createCloudflareImage(env, async () => Response.json({ success: false, errors: [{ code: 3042 }] }, { status: 429 }))("A leaf"), { code: "ILLUSTRATION_QUOTA_EXHAUSTED" });
  await assert.rejects(createCloudflareImage(env, async () => Response.json({ success: true, result: { image: "not an image" } }))("A leaf"), { code: "ILLUSTRATION_UNAVAILABLE" });
});

test("the dispatcher respects Cloudflare allocation and does not silently spend a Z-Image slot", async () => {
  let calls = 0;
  const generate = createLessonImage(env, async url => {
    calls++;
    assert.match(url, /api.cloudflare.com/);
    return Response.json({ success: true, result: { image: png.toString("base64") } });
  });
  assert.deepEqual(await generate("A leaf", { provider: "cloudflare" }), png);
  await assert.rejects(generate("A leaf", { provider: "cloudflare", taskId: "existing-paid-task" }), { code: "INVALID_ILLUSTRATION_PLAN" });
  assert.equal(calls, 1);
});
