import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./support/database.mjs";
import { createRegistrationHandler } from "../apps/web/server/accounts/registration.mjs";
import { createMaterialService } from "../apps/web/server/materials/service.mjs";
import { createMediaPreferenceStore } from "../apps/web/server/documents/media-preferences/store.mjs";
import { createMediaPreferenceHandlers } from "../apps/web/server/documents/media-preferences/http.mjs";

const origin = "http://localhost:3000";
let storage, api, materials, store, a, b, material;
async function account(label) {
  const response = await createRegistrationHandler(storage.db, { origin, registerLimit: 100 })(new Request(`${origin}/api/v1/auth/register`, {
    method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ name: label, email: `${label}@example.test`, password: "Synthetic password" }),
  }));
  assert.equal(response.status, 201);
  return { id: (await response.json()).data.user.id, cookie: response.headers.get("set-cookie").split(";")[0] };
}
function request(id, body, version, user = a, headers = {}) {
  return new Request(`${origin}/api/v1/media-preferences/${id}`, { method: "PUT",
    headers: { origin, "content-type": "application/json", ...(user ? { cookie: user.cookie } : {}),
      ...(version === undefined ? {} : { "if-match": `"${version}"` }), ...headers }, body: JSON.stringify(body),
  });
}
const put = (body, version, id = material.id, user = a, headers) => api.put(request(id, body, version, user, headers), id);
async function read(id = material.id) {
  const response = await api.list(new Request(`${origin}/api/v1/media-preferences?materialIds=${id}`, { headers: { cookie: a.cookie } }));
  assert.equal(response.status, 200);
  return (await response.json()).data[0];
}
before(async () => {
  storage = await testDatabase();
  for (const name of storage.migrations) await storage.migrate(name);
  api = createMediaPreferenceHandlers(storage.db, { origin });
  assert.equal(typeof api.put, "function", "PUT handler is not implemented");
  materials = createMaterialService(storage.db); store = createMediaPreferenceStore(storage.db);
  a = await account("write-a"); b = await account("write-b");
  material = await materials.create(a.id, { title: "Synthetic source", text: "Materi tumbuhan." }, randomUUID());
});
after(async () => { await storage?.close(); });

test("PUT authenticates before reading the body or version header", async () => {
  const response = await api.put(new Request(`${origin}/api/v1/media-preferences/${material.id}`, {
    method: "PUT", headers: { origin, "content-type": "application/json" }, body: "{",
  }), material.id);
  assert.equal(response.status, 401); assert.equal((await response.json()).error.code, "SESSION_REQUIRED");
});

test("PUT saves a canonical versioned preference that GET can read without changing its source", async () => {
  assert.equal((await read()).resourceVersion, 0);
  const response = await put({ selectedMedia: ["song", "reading"], songTemplateId: "cicak_dinding" }, 0, material.id.toUpperCase());
  assert.equal(response.status, 200); assert.equal(response.headers.get("etag"), '"1"');
  assert.equal(response.headers.get("cache-control"), "no-store");
  const saved = (await response.json()).data;
  assert.equal(saved.materialId, material.id); assert.deepEqual(saved.selectedMedia, ["reading", "song"]);
  assert.equal(saved.songTemplateId, "cicak_dinding"); assert.ok(Date.parse(saved.updatedAt));
  assert.equal(saved.userId, undefined);
  assert.deepEqual(await read(), saved); assert.deepEqual(await materials.get(a.id, material.id), material);
});

test("PUT accepts clearing all media while preserving the explicitly selected song template", async () => {
  const response = await put({ selectedMedia: [], songTemplateId: "potong_bebek" }, 1);
  assert.equal(response.status, 200); assert.equal(response.headers.get("etag"), '"2"');
  assert.deepEqual((await response.json()).data.selectedMedia, []);
  assert.equal((await read()).songTemplateId, "potong_bebek");
});

test("PUT rejects missing, malformed and stale If-Match without overwriting preferences", async () => {
  const saved = await read();
  assert.equal((await put({ selectedMedia: [] }, undefined)).status, 428);
  for (const header of ["2", 'W/"2"', '"02"', "*", '"2", "2"']) {
    assert.equal((await put({ selectedMedia: [] }, undefined, material.id, a, { "if-match": header })).status, 400);
  }
  assert.equal((await put({ selectedMedia: ["slides"] }, 1)).status, 412);
  assert.deepEqual(await read(), saved);
});

test("PUT rejects invalid media/templates and field injection without changing stored data", async () => {
  const saved = await read();
  for (const body of [null, [], {}, { selectedMedia: ["video"] }, { selectedMedia: ["reading", "reading"] },
    { selectedMedia: null }, { selectedMedia: [], songTemplateId: "unknown" }, { selectedMedia: [], songTemplateId: null },
    { selectedMedia: [], userId: b.id }, { selectedMedia: [], resourceVersion: 2 }, { selectedMedia: [], archived: false }]) {
    assert.equal((await put(body, 2)).status, 422);
  }
  assert.deepEqual(await read(), saved);
});

test("PUT returns indistinguishable 404 for foreign/missing IDs and rejects cross-origin writes", async () => {
  for (const id of [material.id, randomUUID(), "invalid-id"]) {
    const response = await put({ selectedMedia: ["reading"] }, 0, id, b);
    assert.equal(response.status, 404); assert.equal((await response.json()).error.code, "MATERIAL_NOT_FOUND");
  }
  for (const headers of [{ origin: "https://foreign.example" }, { origin: "" }, { "sec-fetch-site": "cross-site" }]) {
    assert.equal((await put({ selectedMedia: [] }, 2, material.id, a, headers)).status, 403);
  }
  assert.equal((await read()).resourceVersion, 2);
});

test("PUT archive protection preserves old preferences and permits writes after restoration", async () => {
  await materials.patch(a.id, material.id, { archived: true }, 1);
  const saved = await read();
  const denied = await put({ selectedMedia: ["slides"] }, 2);
  assert.equal(denied.status, 409); assert.equal((await denied.json()).error.code, "MATERIAL_ARCHIVED");
  assert.deepEqual(await read(), saved);
  await materials.patch(a.id, material.id, { archived: false }, 2);
  const restored = await put({ selectedMedia: ["slides"] }, 2);
  assert.equal(restored.status, 200); assert.equal(restored.headers.get("etag"), '"3"');
  assert.equal((await restored.json()).data.songTemplateId, "balonku");
});

test("PUT reports malformed JSON, invalid UTF8, unsupported MIME and oversized bodies safely", async () => {
  const saved = await read();
  for (const [body, type, status] of [["{", "application/json", 400], [new Uint8Array([255]), "application/json", 400],
    ["{}", "text/plain", 415], [JSON.stringify({ selectedMedia: ["x".repeat(5000)] }), "application/json", 413]]) {
    const response = await api.put(new Request(`${origin}/api/v1/media-preferences/${material.id}`, {
      method: "PUT", headers: { origin, cookie: a.cookie, "content-type": type, "if-match": '"3"' }, body,
    }), material.id);
    assert.equal(response.status, status);
    const result = await response.json(); assert.equal(result.data, undefined);
    assert.equal(result.error.requestId, response.headers.get("x-request-id"));
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.deepEqual(await read(), saved);
});

test("failed PUT database update returns a safe error and preserves the complete old preference", async () => {
  const saved = await read();
  await storage.sql('ALTER TABLE "MediaPreference" ADD CONSTRAINT synthetic_write_failure CHECK (false) NOT VALID');
  const previous = console.error; console.error = () => {};
  try {
    const response = await put({ selectedMedia: ["reading"] }, 3);
    assert.equal(response.status, 500); assert.equal(response.headers.get("etag"), null);
    assert.ok(!(await response.text()).includes("synthetic_write_failure"));
  } finally { console.error = previous; await storage.sql('ALTER TABLE "MediaPreference" DROP CONSTRAINT synthetic_write_failure'); }
  assert.deepEqual(await read(), saved);
});

test("PostgreSQL: concurrent first PUT requests return one200 and one412", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const row = await materials.create(a.id, { title: "Concurrent PUT", text: "Synthetic text." }, randomUUID());
  const results = await Promise.all(["reading", "slides"].map(id => put({ selectedMedia: [id] }, 0, row.id)));
  assert.deepEqual(results.map(result => result.status).sort(), [200, 412]);
  assert.equal((await store.get(a.id, row.id)).resourceVersion, 1);
});

test("PostgreSQL: PUT queued behind archive sees latest material status", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const row = await materials.create(a.id, { title: "Archive race PUT", text: "Synthetic text." }, randomUUID());
  let acquired, release;
  const locked = new Promise(resolve => { acquired = resolve; }), gate = new Promise(resolve => { release = resolve; });
  const archive = materials.withOwnedMaterial(a.id, row.id, async (tx, source) => {
    acquired(); await gate;
    await tx.material.update({ where: { id: source.id }, data: { archived: true, resourceVersion: { increment: 1 }, updatedAt: new Date() } });
  });
  await locked;
  const save = put({ selectedMedia: ["song"] }, 0, row.id);
  release(); await archive;
  assert.equal((await save).status, 409);
  assert.equal((await store.get(a.id, row.id)).resourceVersion, 0);
});
