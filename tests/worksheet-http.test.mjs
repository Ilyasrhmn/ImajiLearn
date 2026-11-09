import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./support/database.mjs";
import { createSessionHandlers } from "../apps/web/server/accounts/sessions.mjs";
import { issueSession } from "../apps/web/server/accounts/session-issuer.mjs";
import { digest } from "../apps/web/server/core/crypto.mjs";
import { createWorksheetDocumentRepository } from "../apps/web/server/documents/worksheets/repository.mjs";
import { createWorksheetHandlers, WORKSHEET_PATCH_MAX_BYTES } from "../apps/web/server/documents/worksheets/http.mjs";
import { createWorksheetRecord } from "../apps/web/server/documents/worksheets/document.mjs";

const origin = "http://localhost:3000";
let storage, repository, handlers, auth, a, b;
function request(method = "GET", suffix = "", body, { cookie = a?.cookie, headers = {}, raw = false } = {}) {
  const allHeaders = new Headers({ ...(method === "GET" ? {} : { origin, "content-type": "application/json" }),
    ...(cookie ? { cookie } : {}), ...headers });
  for (const [key, value] of Object.entries(headers)) if (value === null) allHeaders.delete(key);
  return new Request(`${origin}/api/v1/worksheets${suffix}`, { method, headers: allHeaders,
    ...(body === undefined ? {} : { body: raw ? body : JSON.stringify(body) }) });
}
const context = id => ({ params: Promise.resolve({ id }) });
function fixture(ownerId = a.id) {
  const source = { id: randomUUID(), title: "Tumbuhan", revision: randomUUID() };
  const content = { templateId: "fold", title: "Bagian tumbuhan", instructions: ["Buka kartu."],
    items: Array.from({ length: 4 }, (_, i) => ({ id: `card-${i}`, front: `Bagian ${i}`, back: "Penjelasan", assetId: null })),
    pairs: [], order: [], groups: [], teacher: { preparation: ["Siapkan kertas."], notes: "" } };
  const document = createWorksheetRecord({ ownerId, source, templateId: "fold", grade: "4", content });
  document.sourceMaterialId = null;
  return document;
}
const seed = document => repository.withTeacherTransaction(document.ownerId, tx => tx.insertSaved(document));
async function account(label) {
  const teacher = await storage.db.teacher.create({ data: { name: `Synthetic ${label}`, email: `worksheet-http-${label}@example.test`, passwordHash: "synthetic-test-hash" } });
  const session = await storage.db.$transaction(tx => issueSession(tx, teacher.id, { secure: false, absoluteSeconds: 3600 }));
  return { id: teacher.id, cookie: session.cookie.split(";")[0] };
}
before(async () => {
  storage = await testDatabase();
  for (const migration of storage.migrations) await storage.migrate(migration);
  a = await account("a"); b = await account("b");
  auth = createSessionHandlers(storage.db, { origin });
  repository = createWorksheetDocumentRepository({ database: storage.db });
  handlers = createWorksheetHandlers({ repository, requireTeacher: auth.requireTeacher, origin });
});
after(async () => { await storage?.close(); });
beforeEach(async () => {
  await storage.db.worksheetDocument.deleteMany();
  await storage.db.worksheetLibrary.deleteMany();
});

test("worksheet endpoints require actual sessions before parsing query, version or body", async () => {
  for (const [handler, req] of [
    ["list", request("GET", "?limit=invalid", undefined, { cookie: null })],
    ["detail", request("GET", "/missing", undefined, { cookie: null })],
    ["update", request("PATCH", "/missing", "invalid json", { cookie: null, raw: true })],
    ["remove", request("DELETE", "/missing", undefined, { cookie: null })],
  ]) {
    const response = await handlers[handler](req, context("missing"));
    assert.equal(response.status, 401); assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.json(); assert.equal(body.error.code, "SESSION_REQUIRED");
    assert.equal(body.error.requestId, response.headers.get("x-request-id"));
  }
  assert.equal(await storage.db.worksheetLibrary.count(), 0);
});

test("list paginates only the current teacher's documents using the API envelope", async () => {
  const documents = [fixture(), fixture(), fixture(), fixture(b.id)];
  for (const document of documents) await seed(document);
  const response = await handlers.list(request("GET", "?limit=2"));
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
  const page = await response.json(); assert.equal(page.data.length, 2); assert.equal(typeof page.page.nextCursor, "string");
  const last = await handlers.list(request("GET", `?limit=2&cursor=${page.page.nextCursor}`));
  const next = await last.json(); assert.equal(next.data.length, 1); assert.equal(next.page.nextCursor, null);
  const ids = [...page.data, ...next.data].map(document => document.id);
  assert.equal(new Set(ids).size, 3); assert.ok(!ids.includes(documents[3].id));
  assert.ok(page.data.every(document => !Object.hasOwn(document, "ownerId") && document.schemaVersion === 1));
  for (const query of ["?limit=0", "?limit=101", "?limit=1.5", "?limit=", "?cursor=bad"]) {
    assert.equal((await handlers.list(request("GET", query))).status, 422);
  }
  for (const query of ["?limit=1&limit=2", "?ownerId=foreign", "?cursor=a&cursor=b"]) {
    assert.equal((await handlers.list(request("GET", query))).status, 400);
  }
});

test("detail returns a strong ETag and source snapshot even after material deletion", async () => {
  const document = fixture(); await seed(document);
  const response = await handlers.detail(request(), context(document.id));
  assert.equal(response.status, 200); assert.equal(response.headers.get("etag"), '"1"');
  const data = (await response.json()).data;
  assert.deepEqual(data.source, document.source); assert.deepEqual(data.displayOrder, document.displayOrder);
  assert.equal(data.schemaVersion, 1); assert.equal(data.resourceVersion, 1);
  assert.equal(Object.hasOwn(data, "sourceMaterialId"), false);
});

test("foreign IDs return the same public error as missing IDs across detail, edit and delete", async () => {
  const foreign = fixture(b.id); await seed(foreign);
  for (const id of [foreign.id, randomUUID(), "opaque-missing-id"]) {
    const reads = await handlers.detail(request(), context(id));
    const patch = await handlers.update(request("PATCH", `/${id}`, { theme: "color" }, { headers: { "if-match": '"1"' } }), context(id));
    const remove = await handlers.remove(request("DELETE", `/${id}`, undefined, { headers: { "if-match": '"1"' } }), context(id));
    for (const response of [reads, patch, remove]) {
      assert.equal(response.status, 404); const error = (await response.json()).error;
      assert.equal(error.code, "WORKSHEET_NOT_FOUND"); assert.equal(error.message, "LKPD tidak ditemukan.");
    }
  }
  assert.equal(await storage.db.worksheetDocument.count(), 1);
});

test("PATCH edits only content/theme and advances resourceVersion without changing schema or card order", async () => {
  const document = fixture(); await seed(document);
  const content = structuredClone(document.content); content.items[0].front = "Akar";
  const response = await handlers.update(request("PATCH", `/${document.id}`, { content, theme: "color" }, { headers: { "if-match": '"1"' } }), context(document.id));
  assert.equal(response.status, 200); assert.equal(response.headers.get("etag"), '"2"');
  const updated = (await response.json()).data;
  assert.equal(updated.schemaVersion, 1); assert.equal(updated.resourceVersion, 2); assert.equal(updated.theme, "color");
  assert.equal(updated.content.items[0].front, "Akar");
  for (const key of ["id", "source", "templateId", "grade", "displayOrder", "cacheKey", "createdAt"]) assert.deepEqual(updated[key], document[key]);
  assert.equal((await handlers.update(request("PATCH", "", { theme: "ink" }, { headers: { "if-match": '"1"' } }), context(document.id))).status, 412);
});

test("write requests require a single, strong numeric If-Match ETag", async () => {
  const document = fixture(); await seed(document);
  for (const value of [null, "1", "*", 'W/"1"', '"0"', '"01"', '"-1"', '"1.5"', '"1", "2"', '"9007199254740992"']) {
    for (const method of ["PATCH", "DELETE"]) {
      const req = request(method, "", method === "PATCH" ? { theme: "color" } : undefined, { headers: { "if-match": value } });
      const response = await handlers[method === "PATCH" ? "update" : "remove"](req, context(document.id));
      assert.equal(response.status, value === null ? 428 : 400);
    }
  }
  assert.equal((await storage.db.worksheetDocument.findUnique({ where: { id: document.id } })).resourceVersion, 1);
});

test("write Origin protection uses the shared core policy", async () => {
  const document = fixture(); await seed(document);
  for (const headers of [{ origin: null }, { origin: "https://foreign.example" }, { "sec-fetch-site": "cross-site" }]) {
    for (const method of ["PATCH", "DELETE"]) {
      const req = request(method, "", method === "PATCH" ? { theme: "color" } : undefined, { headers: { "if-match": '"1"', ...headers } });
      assert.equal((await handlers[method === "PATCH" ? "update" : "remove"](req, context(document.id))).status, 403);
    }
  }
  assert.equal(await storage.db.worksheetDocument.count(), 1);
});

test("PATCH rejects malformed JSON, wrong MIME, oversize bytes and invalid document fields", async () => {
  const document = fixture(); await seed(document);
  const cases = [
    [400, "invalid json", { raw: true }],
    [415, { theme: "color" }, { headers: { "content-type": "text/plain" } }],
    [413, " ".repeat(WORKSHEET_PATCH_MAX_BYTES + 1), { raw: true }],
    [413, { theme: "color" }, { headers: { "content-length": String(WORKSHEET_PATCH_MAX_BYTES + 1) } }],
    [422, { ownerId: b.id }, {}], [422, { theme: "dark" }, {}], [422, {}, {}],
  ];
  for (const [expected, body, options] of cases) {
    const response = await handlers.update(request("PATCH", "", body, { ...options, headers: { "if-match": '"1"', ...options.headers } }), context(document.id));
    assert.equal(response.status, expected); assert.equal(typeof (await response.json()).error.requestId, "string");
  }
  const badAsset = structuredClone(document.content); badAsset.items[0].assetId = "https://example.com/image.svg";
  const tooLong = structuredClone(document.content); tooLong.title = "x".repeat(30001);
  for (const content of [badAsset, tooLong]) {
    assert.equal((await handlers.update(request("PATCH", "", { content }, { headers: { "if-match": '"1"' } }), context(document.id))).status, 422);
  }
  assert.equal((await storage.db.worksheetDocument.findUnique({ where: { id: document.id } })).resourceVersion, 1);
});

test("concurrent HTTP edits return one success and one 412", async () => {
  const document = fixture(); await seed(document);
  const results = await Promise.all(["ink", "color"].map(theme => handlers.update(request("PATCH", "", { theme }, { headers: { "if-match": '"1"' } }), context(document.id))));
  assert.deepEqual(results.map(response => response.status).sort(), [200, 412]);
});

test("PostgreSQL-incompatible text returns JSON422 instead of an internal database error", async () => {
  const document = fixture(); await seed(document);
  for (const front of ["A\0B", "A\ud800", "A\udfff"]) {
    const content = structuredClone(document.content); content.items[0].front = front;
    const response = await handlers.update(request("PATCH", "", { content }, { headers: { "if-match": '"1"' } }), context(document.id));
    assert.equal(response.status, 422); assert.equal((await response.json()).error.code, "INVALID_WORKSHEET");
  }
  assert.equal((await storage.db.worksheetDocument.findUnique({ where: { id: document.id } })).resourceVersion, 1);
});

test("resource-version exhaustion returns JSON409 without exceeding PostgreSQL integer capacity", async () => {
  const document = fixture(); await seed(document);
  await storage.db.worksheetDocument.update({ where: { id: document.id }, data: { resourceVersion: 2147483646 } });
  const last = await handlers.update(request("PATCH", "", { theme: "color" }, { headers: { "if-match": '"2147483646"' } }), context(document.id));
  assert.equal(last.status, 200); assert.equal(last.headers.get("etag"), '"2147483647"');
  const exhausted = await handlers.update(request("PATCH", "", { theme: "ink" }, { headers: { "if-match": '"2147483647"' } }), context(document.id));
  assert.equal(exhausted.status, 409); assert.equal((await exhausted.json()).error.code, "WORKSHEET_VERSION_EXHAUSTED");
  const saved = await storage.db.worksheetDocument.findUnique({ where: { id: document.id } });
  assert.equal(saved.resourceVersion, 2147483647); assert.equal(saved.theme, "color");
});

test("DELETE requires the current version and returns 204 with no body", async () => {
  const document = fixture(); await seed(document);
  assert.equal((await handlers.remove(request("DELETE", "", undefined, { headers: { "if-match": '"2"' } }), context(document.id))).status, 412);
  const removed = await handlers.remove(request("DELETE", "", undefined, { headers: { "if-match": '"1"' } }), context(document.id));
  assert.equal(removed.status, 204); assert.equal(await removed.text(), ""); assert.equal(removed.headers.get("cache-control"), "no-store");
  assert.equal((await handlers.detail(request(), context(document.id))).status, 404);
});

test("expired and logged-out sessions lose access to saved documents", async () => {
  const document = fixture(); await seed(document);
  for (const expired of [true, false]) {
    const issued = await storage.db.$transaction(tx => issueSession(tx, a.id, { secure: false, absoluteSeconds: 3600 }));
    const cookie = issued.cookie.split(";")[0];
    if (expired) await storage.db.session.update({ where: { tokenHash: digest(cookie.split("=")[1]) }, data: { expiresAt: new Date(0) } });
    else assert.equal((await auth.logout(request("POST", "", undefined, { cookie }))).status, 204);
    assert.equal((await handlers.detail(request("GET", "", undefined, { cookie }), context(document.id))).status, 401);
  }
});

test("unavailable storage yields JSON503 instead of a fake empty list or leaked connection details", async () => {
  const unavailable = createWorksheetHandlers({ origin, requireTeacher: auth.requireTeacher,
    repository: { withTeacherTransaction: async () => { throw Object.assign(new Error("postgresql://private-secret@invalid/db"), { code: "ECONNREFUSED" }); } } });
  const response = await unavailable.list(request()); assert.equal(response.status, 503);
  const text = await response.text(); assert.ok(!text.includes("private-secret")); assert.ok(!text.includes('"data":[]'));
  assert.equal(JSON.parse(text).error.code, "DATABASE_UNAVAILABLE");
});
