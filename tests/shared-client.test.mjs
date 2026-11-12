import test from "node:test";
import assert from "node:assert/strict";
import { studioRequest } from "@imajilearn/shared/lib/studio-api.mjs";
import { requestAccount } from "@imajilearn/shared/lib/account-client.mjs";
import { sessionLoginPath } from "@imajilearn/shared/lib/session.mjs";

test("connection failures are actionable while cancellation remains an abort", async t => {
  t.mock.method(globalThis, "fetch", async () => { throw new TypeError("Failed to fetch"); });
  await assert.rejects(studioRequest("owner", "/materials"), /Periksa koneksi/);
  const controller = new AbortController();
  t.mock.method(globalThis, "fetch", async () => { controller.abort(); throw new TypeError("Network"); });
  await assert.rejects(studioRequest("owner", "/materials", { signal: controller.signal }), error => error.name === "AbortError");
});

test("expired sessions keep the caller in the correct web or mobile login flow", async t => {
  assert.equal(sessionLoginPath("/apple"), "/masuk");
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  t.after(() => { if (oldWindow) Object.defineProperty(globalThis, "window", oldWindow); else delete globalThis.window; });
  t.mock.method(globalThis, "fetch", async () => Response.json({ error: { code: "SESSION_REQUIRED", message: "Masuk kembali" } }, { status: 401 }));
  for (const [pathname, target] of [["/app", "/app/masuk"], ["/dashboard", "/masuk"]]) {
    const redirects = [];
    Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { pathname, replace: path => redirects.push(path) } } });
    await assert.rejects(studioRequest("teacher", "/materials"), error => error.status === 401);
    assert.equal(await requestAccount("teacher"), null);
    assert.deepEqual(redirects, [target, target]);
  }
});

test("shared transport preserves version conflicts, account identity and multipart uploads", async t => {
  let sent;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    sent = { url, ...options };
    return Response.json({ error: { code: "RESOURCE_CHANGED", message: "Data berubah" } }, { status: 412 });
  });
  await assert.rejects(studioRequest("owner", "/exams/id", { method: "PATCH", version: 7, body: { title: "Edited" } }), error => error.status === 412);
  assert.equal(sent.url, "/api/v1/exams/id");
  assert.equal(sent.headers["If-Match"], '"7"');
  assert.equal(sent.headers["X-Teacher-Id"], "owner");
  assert.equal(sent.cache, "no-store");
  assert.equal(JSON.parse(sent.body).title, "Edited");
  const form = new FormData(); form.set("title", "Material");
  await assert.rejects(studioRequest("owner", "/materials", { method: "POST", key: "retry-key", body: form }));
  assert.equal(sent.body, form);
  assert.equal(sent.headers["Idempotency-Key"], "retry-key");
  assert.equal(sent.headers["Content-Type"], undefined);
});
