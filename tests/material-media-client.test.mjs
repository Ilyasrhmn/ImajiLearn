import assert from "node:assert/strict";
import { test } from "node:test";
import { generateMaterialMedia, rememberMaterialMedia } from "../apps/web/lib/material-media.mjs";

test("generation returns its result even if saving the dashboard preference fails", async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push([url, init.method]);
    if (url === "/api/v1/materials/material/reading") return Response.json({ data: { title: "Bacaan" } });
    return Response.json({ error: { message: "Preferensi tidak tersedia." } }, { status: 503 });
  };
  try {
    const data = await generateMaterialMedia("teacher", "/materials/material/reading", "material", "reading");
    assert.deepEqual(data, { title: "Bacaan" });
    assert.deepEqual(calls, [
      ["/api/v1/materials/material/reading", "POST"],
      ["/api/v1/media-preferences?materialIds=material", "GET"],
    ]);
  } finally { globalThis.fetch = original; }
});

test("recording completed formats retries a preference conflict and preserves other selections", async () => {
  const original = globalThis.fetch;
  let reads = 0;
  const updates = [];
  globalThis.fetch = async (_url, init) => {
    if (init.method === "GET") {
      reads++;
      return Response.json({ data: [{
        selectedMedia: reads === 1 ? ["song"] : ["song", "slides"],
        songTemplateId: "cicak_dinding", resourceVersion: reads,
      }] });
    }
    updates.push({ version: init.headers["If-Match"], body: JSON.parse(init.body) });
    return updates.length === 1
      ? Response.json({ error: { message: "Preferensi berubah." } }, { status: 412 })
      : Response.json({ data: {} });
  };
  try {
    await rememberMaterialMedia("teacher", "material", ["reading"]);
    assert.deepEqual(updates, [
      { version: '"1"', body: { selectedMedia: ["song", "reading"], songTemplateId: "cicak_dinding" } },
      { version: '"2"', body: { selectedMedia: ["song", "slides", "reading"], songTemplateId: "cicak_dinding" } },
    ]);
  } finally { globalThis.fetch = original; }
});
