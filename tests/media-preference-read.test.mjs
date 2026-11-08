import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./support/database.mjs";
import { createRegistrationHandler } from "../apps/web/server/accounts/registration.mjs";
import { createMaterialService } from "../apps/web/server/materials/service.mjs";
import { createMediaPreferenceStore } from "../apps/web/server/documents/media-preferences/store.mjs";
import { digest } from "../apps/web/server/core/crypto.mjs";

const origin = "http://localhost:3000";
let storage, handler, store, materials, a, b, first, empty, archived, foreign;
async function account(label) {
  const response = await createRegistrationHandler(storage.db, { origin, registerLimit: 100 })(new Request(`${origin}/api/v1/auth/register`, {
    method: "POST", headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ name: label, email: `${label}@example.test`, password: "Synthetic password" }),
  }));
  assert.equal(response.status, 201);
  return { id: (await response.json()).data.user.id, cookie: response.headers.get("set-cookie").split(";")[0] };
}
function read(ids, user = a) {
  const query = Array.isArray(ids) ? `materialIds=${encodeURIComponent(ids.join(","))}` : ids;
  return handler(new Request(`${origin}/api/v1/media-preferences?${query}`, { headers: user ? { cookie: user.cookie } : {} }));
}
const source = user => materials.create(user.id, { title: "Synthetic batch source", text: "Private source text." }, randomUUID());
before(async () => {
  const { createMediaPreferenceHandlers } = await import("../apps/web/server/documents/media-preferences/http.mjs");
  storage = await testDatabase();
  for (const name of storage.migrations) await storage.migrate(name);
  handler = createMediaPreferenceHandlers(storage.db, { origin }).list;
  materials = createMaterialService(storage.db); store = createMediaPreferenceStore(storage.db);
  a = await account("read-a"); b = await account("read-b");
  first = await source(a); empty = await source(a); archived = await source(a); foreign = await source(b);
  await store.save(a.id, first.id, { selectedMedia: ["song", "reading"], songTemplateId: "cicak_dinding" }, 0);
  await store.save(a.id, archived.id, { selectedMedia: [], songTemplateId: "potong_bebek" }, 0);
  await materials.patch(a.id, archived.id, { archived: true }, 1);
});
after(async () => { await storage?.close(); });

test("GET batch combines saved/default/archived preferences in request order with canonical IDs", async () => {
  const response = await read([archived.id, empty.id, first.id.toUpperCase()]);
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(response.headers.get("x-request-id"), /^[a-f\d-]{36}$/);
  const body = await response.json();
  assert.deepEqual(body.page, { nextCursor: null });
  assert.deepEqual(body.data.map(item => item.materialId), [archived.id, empty.id, first.id]);
  assert.equal(body.data[0].songTemplateId, "potong_bebek");
  assert.deepEqual(body.data[1], { materialId: empty.id, selectedMedia: [], songTemplateId: "balonku", resourceVersion: 0, updatedAt: null });
  assert.deepEqual(body.data[2].selectedMedia, ["reading", "song"]);
  assert.equal(body.data[2].resourceVersion, 1);
  assert.ok(!JSON.stringify(body).includes("Private source text"));
  assert.ok(!JSON.stringify(body).includes(a.id)); assert.ok(!JSON.stringify(body).includes("userId"));
});

test("GET authenticates before parsing and rejects revoked sessions", async () => {
  assert.equal((await read([first.id], null)).status, 401);
  assert.equal((await read("", null)).status, 401);
  const revoked = await account("read-revoked");
  await storage.db.session.deleteMany({ where: { userId: revoked.id } });
  assert.equal((await read([first.id], revoked)).status, 401);
});

test("GET rejects missing/duplicate/unknown query parameters, invalid batches and 101 IDs", async () => {
  for (const query of ["", "materialIds=", `materialIds=${first.id}&limit=1`, `materialIds=${first.id}&materialIds=${empty.id}`,
    `materialIds=${first.id},`, `materialIds=${first.id},${first.id.toUpperCase()}`, `materialIds=${"x".repeat(101)}`,
    `materialIds=${Array.from({ length: 101 }, () => randomUUID()).join(",")}`]) {
    const response = await read(query);
    assert.equal(response.status, 422);
    const body = await response.json(); assert.equal(body.data, undefined); assert.ok(body.error.requestId);
  }
});

test("GET whole-batch ownership failure returns no partial results and foreign/missing errors match", async () => {
  let expected;
  for (const id of [foreign.id, randomUUID(), "invalid-id"]) {
    const response = await read([first.id, id, empty.id]);
    assert.equal(response.status, 404);
    const body = await response.json(); assert.equal(body.data, undefined); assert.equal(body.page, undefined);
    const error = { code: body.error.code, message: body.error.message };
    if (expected) assert.deepEqual(error, expected); else expected = error;
  }
  assert.equal((await read([first.id], b)).status, 404);
  assert.equal((await read([foreign.id], b)).status, 200);
});

test("GET returns all 100 requested materials without implicit pagination or preference creation", async () => {
  const ids = Array.from({ length: 100 }, () => randomUUID());
  await storage.db.material.createMany({ data: ids.map((id, index) => ({ id, userId: a.id,
    title: `Batch ${index}`, text: "Synthetic text", revision: digest(JSON.stringify({ title: `Batch ${index}`, text: "Synthetic text" })),
  })) });
  const count = await storage.db.mediaPreference.count();
  const response = await read(ids.toReversed());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.length, 100); assert.equal(body.page.nextCursor, null);
  assert.deepEqual(body.data.map(row => row.materialId), ids.toReversed());
  assert.ok(body.data.every(row => row.resourceVersion === 0));
  assert.equal(await storage.db.mediaPreference.count(), count);
  assert.deepEqual(await materials.get(a.id, first.id), first);
});

test("PostgreSQL: batch read uses one consistent snapshot across ownership and preference queries", { skip: !process.env.TEST_DATABASE_URL, timeout: 15000 }, async () => {
  const material = await source(a);
  let reached, release;
  const ownershipRead = new Promise(resolve => { reached = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const gated = storage.db.$extends({ query: { material: { async findMany({ args, query }) {
    const rows = await query(args); reached(); await gate; return rows;
  } } } });
  const pending = createMediaPreferenceStore(gated).list(a.id, [material.id]);
  await ownershipRead;
  try { await store.save(a.id, material.id, { selectedMedia: ["slides"] }, 0); }
  finally { release(); }
  assert.equal((await pending)[0].resourceVersion, 0);
  assert.equal((await store.list(a.id, [material.id]))[0].resourceVersion, 1);
});
