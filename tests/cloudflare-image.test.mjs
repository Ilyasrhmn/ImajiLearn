import assert from "node:assert/strict";
import { test } from "node:test";
import { generateIllustration } from "../apps/web/server/ai/providers/cloudflare-image.mjs";

test("illustration errors distinguish exhausted daily quota, throttling and access failures", async t => {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  process.env.CLOUDFLARE_ACCOUNT_ID = "a".repeat(32);
  process.env.CLOUDFLARE_API_TOKEN = "test";
  t.after(() => {
    if (account === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID; else process.env.CLOUDFLARE_ACCOUNT_ID = account;
    if (token === undefined) delete process.env.CLOUDFLARE_API_TOKEN; else process.env.CLOUDFLARE_API_TOKEN = token;
  });
  for (const [status, message, code] of [
    [429, "you have used up your daily free allocation of 10,000 neurons", "ILLUSTRATION_QUOTA_EXHAUSTED"],
    [200, "you have used up your daily free allocation", "ILLUSTRATION_QUOTA_EXHAUSTED"],
    [429, "Too many requests", "ILLUSTRATION_RATE_LIMITED"],
    [403, "Not authorized", "ILLUSTRATION_ACCESS_DENIED"],
    [503, "Unavailable", "ILLUSTRATION_UNAVAILABLE"],
  ]) {
    const mocked = t.mock.method(globalThis, "fetch", async () => Response.json({ success: false, errors: [{ message }] }, { status }));
    await assert.rejects(generateIllustration("A cube"), { code });
    mocked.mock.restore();
  }
});
