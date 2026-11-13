import assert from "node:assert/strict";
import { test } from "node:test";
import { waitForSong } from "../apps/web/lib/song-polling.mjs";

test("the song player can refresh immediately and continue karaoke alignment without a ten-minute cutoff", async t => {
  const updates = [], waits = [];
  let calls = 0, elapsed = 0;
  t.mock.method(Date, "now", () => elapsed);
  t.mock.method(globalThis, "setTimeout", (callback, milliseconds) => {
    elapsed += 11 * 60_000; waits.push(milliseconds); queueMicrotask(callback); return 0;
  });
  t.mock.method(globalThis, "fetch", async () => Response.json({ data: { status: "ready", alignmentPending: ++calls < 3 } }));
  const result = await waitForSong("teacher", "/materials/id/song", { immediate: true, includeAlignment: true, onUpdate: song => updates.push(song) });
  assert.equal(calls, 3);
  assert.equal(updates.length, 3);
  assert.equal(result.alignmentPending, false);
  assert.deepEqual(waits, [5000, 5000]);
});

test("song polling survives more than ten minutes and temporary provider failures without another POST", async t => {
  let elapsed = 0, calls = 0;
  t.mock.method(Date, "now", () => elapsed);
  t.mock.method(globalThis, "setTimeout", callback => {
    elapsed += 11 * 60_000; queueMicrotask(callback); return 0;
  });
  t.mock.method(globalThis, "fetch", async (_, options) => {
    assert.equal(options.method, "GET");
    if (++calls === 2) return Response.json({ error: { code: "PROVIDER_UNAVAILABLE", message: "Waiting" } }, { status: 503 });
    return Response.json({ data: { status: calls < 4 ? "generating" : "ready", versions: [{ id: "first" }, { id: "second" }] } });
  });
  const result = await waitForSong("teacher", "/materials/id/song", { signal: new AbortController().signal });
  assert.equal(result.status, "ready");
  assert.equal(result.versions.length, 2);
  assert.equal(calls, 4);
});

test("song polling stops on cancellation, authentication errors and uncertain paid tasks", async t => {
  const controller = new AbortController();
  t.mock.method(globalThis, "setTimeout", callback => { queueMicrotask(callback); return 0; });
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; return Response.json({ data: { status: "uncertain" } }); });
  assert.equal((await waitForSong("teacher", "/materials/id/song", { signal: controller.signal })).status, "uncertain");
  assert.equal(calls, 1);
  t.mock.method(globalThis, "fetch", async () => Response.json({ error: { code: "PROVIDER_AUTH_ERROR", message: "Invalid key" } }, { status: 503 }));
  await assert.rejects(waitForSong("teacher", "/materials/id/song", { signal: controller.signal }), { code: "PROVIDER_AUTH_ERROR" });
  controller.abort(new DOMException("Canceled", "AbortError"));
  await assert.rejects(waitForSong("teacher", "/materials/id/song", { signal: controller.signal }), { name: "AbortError" });
});
