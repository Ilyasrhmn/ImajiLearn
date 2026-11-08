import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./support/database.mjs";
import { createRegistrationHandler } from "../apps/web/server/accounts/registration.mjs";

const origin = "http://localhost:3000", source = "  Materi tumbuhan 🙂\nBaris kedua.  ";
let storage, api, service, a, b, material, createMaterialService;
function req(method, path, body, { cookie, key, version, headers = {} } = {}) {
  return new Request(`${origin}/api/v1/${path}`, { method,
    headers: { ...(method === "GET" ? {} : { origin, "content-type": "application/json" }),
      ...(cookie ? { cookie } : {}), ...(key ? { "idempotency-key": key } : {}),
      ...(version === undefined ? {} : { "if-match": `"${version}"` }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function account(label) {
  const response = await createRegistrationHandler(storage.db, { origin, registerLimit: 100 })(req("POST", "auth/register", {
    name: label, email: `${label}@example.test`, password: "Synthetic password",
  }));
  assert.equal(response.status, 201);
  return { id: (await response.json()).data.user.id, cookie: response.headers.get("set-cookie").split(";")[0] };
}
const create = (body, user = a, key = randomUUID()) => api.create(req("POST", "materials", body, { cookie: user.cookie, key }));
const get = (id, user = a) => api.get(req("GET", `materials/${id}`, undefined, { cookie: user.cookie }), id);
const patch = (id, body, version, user = a) => api.patch(req("PATCH", `materials/${id}`, body, { cookie: user.cookie, version }), id);
before(async () => {
  const { createMaterialHandlers } = await import("../apps/web/server/materials/http.mjs");
  ({ createMaterialService } = await import("../apps/web/server/materials/service.mjs"));
  storage = await testDatabase();
  for (const name of storage.migrations) await storage.migrate(name);
  api = createMaterialHandlers(storage.db, { origin }); service = createMaterialService(storage.db);
  a = await account("materials-a"); b = await account("materials-b");
});
after(async () => { await storage?.close(); });

test("manual material persists exact source text, server revision and private versioned DTO", async () => {
  const response = await create({ title: "  Tumbuhan  ", text: source });
  assert.equal(response.status, 201); assert.equal(response.headers.get("etag"), '"1"');
  material = (await response.json()).data;
  assert.equal(material.title, "Tumbuhan"); assert.equal(material.text, source);
  assert.match(material.revision, /^[a-f\d]{64}$/); assert.ok(Date.parse(material.createdAt));
  assert.equal(material.extractionStatus, "ready"); assert.equal(material.file, null);
  assert.equal(material.resourceVersion, 1);
  for (const field of ["userId", "lockVersion", "passwordHash"]) assert.equal(material[field], undefined);
  const fresh = createMaterialService(storage.db);
  assert.deepEqual(await fresh.get(a.id, material.id), material);
  const read = await get(material.id.toUpperCase());
  assert.equal(read.status, 200); assert.equal(read.headers.get("cache-control"), "no-store");
  assert.equal((await read.json()).data.id, material.id);
});

test("authentication, Origin and foreign ownership guard all material operations", async () => {
  assert.equal((await api.create(req("POST", "materials", { title: "X", text: source }, { key: randomUUID() }))).status, 401);
  assert.equal((await api.get(req("GET", "materials/x"), material.id)).status, 401);
  assert.equal((await api.patch(req("PATCH", "materials/x", { archived: true }, { version: 1 }), material.id)).status, 401);
  assert.equal((await api.create(req("POST", "materials", { title: "X", text: source }, { cookie: a.cookie, key: randomUUID(), headers: { origin: "https://foreign.example" } }))).status, 403);
  for (const id of [material.id, randomUUID(), "invalid-id"]) {
    assert.equal((await get(id, b)).status, 404);
    assert.equal((await patch(id, { archived: true }, 1, b)).status, 404);
  }
  assert.equal((await create({ title: "X", text: source, userId: b.id })).status, 422);
});

test("material source readers enforce ownership and return complete ready-source snapshots", async () => {
  const reader = await service.getOwnedMaterial(a.id, material.id.toUpperCase());
  assert.equal(reader.text, source); assert.equal(reader.revision, material.revision);
  assert.equal(reader.extractionStatus, "ready"); assert.equal(reader.userId, undefined);
  await assert.rejects(service.getOwnedMaterial(b.id, material.id), { status: 404 });
  const foreign = (await (await create({ title: "Private", text: "Other source" }, b)).json()).data;
  assert.deepEqual((await service.getOwnedMaterials(a.id, [material.id])).map(row => row.id), [material.id]);
  await assert.rejects(service.getOwnedMaterials(a.id, [material.id, foreign.id]), { status: 404 });
  const { getOwnedMaterial } = await import("../apps/web/server/materials/readers.mjs");
  assert.equal(await storage.db.$transaction(tx => getOwnedMaterial(tx, b.id, material.id)), null);
  const afterRead = (await (await get(material.id)).json()).data;
  assert.equal(afterRead.updatedAt, material.updatedAt); assert.equal(afterRead.resourceVersion, 1);
});

test("archive/restore use resource versions without changing source revision", async () => {
  let response = await patch(material.id, { archived: true }, 1);
  assert.equal(response.status, 200); assert.equal(response.headers.get("etag"), '"2"');
  const archived = (await response.json()).data;
  assert.equal(archived.archived, true); assert.equal(archived.revision, material.revision);
  assert.equal((await service.getOwnedMaterial(a.id, material.id)).archived, true);
  assert.equal((await patch(material.id, { archived: false }, 1)).status, 412);
  assert.equal((await patch(material.id, { archived: false }, undefined)).status, 428);
  for (const header of ["1", 'W/"2"', '"02"', "*"]) {
    assert.equal((await api.patch(req("PATCH", "materials/x", { archived: false }, { cookie: a.cookie, headers: { "if-match": header } }), material.id)).status, 400);
  }
  response = await patch(material.id, { archived: false }, 2);
  assert.equal(response.status, 200); assert.equal((await response.json()).data.resourceVersion, 3);
});

test("idempotent create replays the original response, scopes keys to owners and rejects changed payload", async () => {
  const key = randomUUID(), body = { title: "Replay", text: source };
  const first = await create(body, a, key), second = await create({ text: source, title: "Replay" }, a, key);
  assert.equal(first.status, 201); assert.equal(second.status, 201);
  assert.deepEqual(await first.json(), await second.json());
  assert.equal((await create({ ...body, text: "Changed" }, a, key)).status, 409);
  assert.equal((await create(body, b, key)).status, 201);
  assert.equal(await storage.db.material.count({ where: { userId: a.id, title: "Replay" } }), 1);
  await storage.db.idempotency.updateMany({ where: { userId: a.id, key }, data: { expiresAt: new Date(0) } });
  assert.equal((await create({ title: "After expiry", text: source }, a, key)).status, 201);
});

test("validation enforces UTF16 limits, rejects empty sources, invalid types and injected fields", async () => {
  for (const body of [null, [], {}, { title: " ", text: source }, { title: "x".repeat(121), text: source },
    { title: "X", text: " " }, { title: "X", text: "x".repeat(40001) }, { title: "X", text: null },
    { title: "X", text: "nul\u0000" }, { title: "nul\u0000", text: source }, { title: "X", text: source, revision: "forged" }]) {
    assert.equal((await create(body)).status, 422);
  }
  assert.equal((await create({ title: "🙂".repeat(60), text: "🙂".repeat(20000) })).status, 201);
  for (const body of [{ archived: "true" }, { archived: true, userId: b.id }, { text: "overwrite" }]) {
    assert.equal((await patch(material.id, body, 3)).status, 422);
  }
  assert.equal((await create({ title: "No key", text: source }, a, "")).status, 400);
});

test("material body budget and unsupported upload format return clear errors", async () => {
  const response = await create({ title: "Oversized", text: "x".repeat(270000) });
  assert.equal(response.status, 413);
  assert.equal((await api.create(req("POST", "materials", { title: "X", text: source }, {
    cookie: a.cookie, key: randomUUID(), headers: { "content-type": "multipart/form-data; boundary=test" },
  }))).status, 415);
});

test("failed material persistence rolls the idempotency reservation back for a clean retry", async () => {
  const key = randomUUID(), body = { title: "Retry after failure", text: source };
  await storage.sql('ALTER TABLE "Material" ADD CONSTRAINT synthetic_material_failure CHECK (false) NOT VALID');
  const previous = console.error; console.error = () => {};
  try { assert.equal((await create(body, a, key)).status, 500); }
  finally { console.error = previous; await storage.sql('ALTER TABLE "Material" DROP CONSTRAINT synthetic_material_failure'); }
  assert.equal(await storage.db.idempotency.count({ where: { userId: a.id, key } }), 0);
  assert.equal((await create(body, a, key)).status, 201);
});

test("material migration preserves existing teachers and worksheets", async () => {
  const upgrade = await testDatabase();
  try {
    const materialIndex = upgrade.migrations.findIndex(name => name.includes("owned_materials"));
    assert.ok(materialIndex > 0);
    for (const migration of upgrade.migrations.slice(0, materialIndex)) await upgrade.migrate(migration);
    const teacher = await upgrade.db.teacher.create({ data: { name: "Upgrade", email: "material-upgrade@example.test", passwordHash: "synthetic-hash" } });
    await upgrade.db.worksheetLibrary.create({ data: { ownerId: teacher.id } });
    const content = { templateId: "fold", title: "Existing worksheet", instructions: ["Buka kartu."],
      items: ["a", "b", "c", "d"].map(id => ({ id, front: id, back: "Penjelasan", assetId: null })),
      pairs: [], order: [], groups: [], teacher: { preparation: ["Siapkan kertas."], notes: "" } };
    const select = { id: true, ownerId: true, sourceId: true, sourceTitle: true, sourceRevision: true,
      templateId: true, content: true, displayOrder: true, cacheKey: true, createdAt: true, updatedAt: true };
    const worksheet = await upgrade.db.worksheetDocument.create({ data: {
      id: randomUUID(), ownerId: teacher.id, sourceId: randomUUID(), sourceTitle: "Historical source", sourceRevision: "full-existing-revision",
      templateId: "fold", grade: "4", language: "id", theme: "ink", content, displayOrder: ["a", "b", "c", "d"],
      cacheKey: "a".repeat(64), createdAt: new Date("2026-11-08T00:00:00Z"), updatedAt: new Date("2026-11-08T00:00:00Z"),
    }, select });
    for (const migration of upgrade.migrations.slice(materialIndex)) await upgrade.migrate(migration);
    assert.deepEqual(await upgrade.db.teacher.findUnique({ where: { id: teacher.id } }), teacher);
    assert.deepEqual(await upgrade.db.worksheetDocument.findUnique({ where: { id: worksheet.id }, select }), worksheet);
    assert.equal(await upgrade.db.material.count(), 0);
  } finally { await upgrade.close(); }
});

test("PostgreSQL: simultaneous creates with the same key persist one material", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const key = randomUUID(), body = { title: "Concurrent replay", text: source };
  const responses = await Promise.all([1, 2, 3].map(() => create(body, a, key)));
  assert.deepEqual(responses.map(r => r.status), [201, 201, 201]);
  const data = await Promise.all(responses.map(r => r.json()));
  assert.equal(new Set(data.map(row => row.data.id)).size, 1);
  assert.equal(await storage.db.material.count({ where: { userId: a.id, title: body.title } }), 1);
});

test("PostgreSQL: concurrent archive writes from the same version have one winner", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const row = (await (await create({ title: "Concurrent archive", text: source })).json()).data;
  const responses = await Promise.all([true, false].map(archived => patch(row.id, { archived }, 1)));
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 412]);
  assert.equal((await service.get(a.id, row.id)).resourceVersion, 2);
});
