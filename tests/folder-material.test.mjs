import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./support/database.mjs";
import { issueSession } from "../apps/web/server/accounts/session-issuer.mjs";
import { createFolderHandlers } from "../apps/web/server/folders/http.mjs";
import { createMaterialHandlers } from "../apps/web/server/materials/http.mjs";

const origin = "http://localhost:3000";
let storage, folders, materials, a, b;

function request(method, path, user, body, options = {}) {
  const headers = {
    origin,
    ...(user ? { cookie: user.cookie } : {}),
    ...(body === undefined ? {} : { "content-type": "application/json" }),
    ...(options.key ? { "idempotency-key": options.key } : {}),
    ...(options.version === undefined ? {} : { "if-match": `"${options.version}"` }),
    ...options.headers,
  };
  return new Request(`${origin}/api/v1/${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function account(label) {
  const teacher = await storage.db.teacher.create({
    data: { name: label, email: `${label}@example.test`, passwordHash: "synthetic-test-hash" },
  });
  const issued = await storage.db.$transaction(tx => issueSession(tx, teacher.id, { secure: false, absoluteSeconds: 3600 }));
  return { id: teacher.id, cookie: issued.cookie.split(";")[0] };
}

before(async () => {
  storage = await testDatabase();
  for (const migration of storage.migrations) await storage.migrate(migration);
  folders = createFolderHandlers(storage.db, { origin });
  materials = createMaterialHandlers(storage.db, { origin });
  a = await account("folders-a");
  b = await account("folders-b");
});
after(async () => { await storage?.close(); });

const createFolder = (name, user = a, key = randomUUID()) =>
  folders.create(request("POST", "folders", user, { name }, { key }));
const updateFolder = (id, name, version, user = a) =>
  folders.rename(request("PATCH", `folders/${id}`, user, { name }, { version }), id);
const removeFolder = (id, version, user = a) =>
  folders.remove(request("DELETE", `folders/${id}`, user, undefined, { version }), id);
const changeMaterial = (id, changes, version, user = a) =>
  materials.patch(request("PATCH", `materials/${id}`, user, changes, { version }), id);
const list = query => materials.list(request("GET", `materials${query}`, a));

test("folder operations isolate owners, normalize names and reject stale or cross-origin edits", async () => {
  assert.equal((await folders.list(request("GET", "folders", null))).status, 401);
  const key = randomUUID();
  const created = await createFolder("  Ilmu\t Alam  ", a, key);
  assert.equal(created.status, 201);
  const { data: folder } = await created.json();
  assert.equal(folder.name, "Ilmu Alam");
  assert.equal(folder.userId, undefined);
  assert.deepEqual((await (await createFolder("Ilmu Alam", a, key)).json()).data, folder);
  assert.equal((await createFolder("ilmu ALAM")).status, 409);
  const other = await createFolder("ilmu ALAM", b);
  assert.equal(other.status, 201);
  const { data: privateFolders } = await (await folders.list(request("GET", "folders", b))).json();
  assert.equal(privateFolders.length, 1);
  assert.notEqual(privateFolders[0].id, folder.id);
  assert.equal((await updateFolder(folder.id, "Foreign", 1, b)).status, 404);
  assert.equal((await removeFolder(folder.id, 1, b)).status, 404);
  assert.equal((await updateFolder(folder.id, "No version", undefined)).status, 428);
  assert.equal((await folders.rename(request("PATCH", "folders", a, { name: "Foreign origin" }, {
    version: 1, headers: { origin: "https://foreign.example" },
  }), folder.id)).status, 403);
  assert.equal((await updateFolder(folder.id, "Sains", 1)).status, 200);
  assert.equal((await updateFolder(folder.id, "Stale", 1)).status, 412);
  assert.equal((await removeFolder(folder.id, 2)).status, 204);
  assert.equal((await createFolder("Ilmu Alam", a, key)).status, 404);
});

test("pin, move, archive and delete preserve owned material and folder guarantees", async () => {
  const { data: folder } = await (await createFolder("Ruang kelas")).json();
  const { data: foreign } = await (await createFolder("Ruang pribadi", b)).json();
  const key = randomUUID();
  const body = { title: "Materi tata surya", text: "Sumber sintetis.", folderId: folder.id };
  const create = (data, idempotencyKey) =>
    materials.create(request("POST", "materials", a, data, { key: idempotencyKey }));
  assert.equal((await create({ ...body, folderId: foreign.id }, randomUUID())).status, 404);
  const response = await create(body, key);
  assert.equal(response.status, 201);
  const { data: material } = await response.json();
  assert.equal(material.folderId, folder.id);
  assert.deepEqual((await (await list("")).json()).data, []);
  assert.equal((await list(`?folderId=${foreign.id}`)).status, 404);
  assert.equal((await (await list("?q=tata")).json()).data[0].id, material.id);
  assert.equal((await changeMaterial(material.id, { folderId: foreign.id }, 1)).status, 404);
  assert.equal((await changeMaterial(material.id, { pinned: true }, 1, b)).status, 404);
  const moved = await changeMaterial(material.id, { pinned: true, folderId: null }, 1);
  assert.equal(moved.status, 200);
  const movedData = (await moved.json()).data;
  assert.equal(movedData.revision, material.revision);
  assert.equal(movedData.folderId, null);
  const unpinned = await create({ title: "Bintang", text: "Sumber kedua." }, randomUUID());
  assert.equal(unpinned.status, 201);
  const first = await (await list("?limit=1")).json();
  assert.equal(first.data[0].id, material.id);
  assert.equal(first.data[0].pinned, true);
  const second = await (await list(`?limit=1&cursor=${first.page.nextCursor}`)).json();
  assert.equal(second.data[0].pinned, false);
  assert.equal((await changeMaterial(material.id, { folderId: folder.id, archived: true }, 2)).status, 200);
  const archived = await (await list("?view=archive")).json();
  assert.equal(archived.data[0].id, material.id);
  const blocked = await removeFolder(folder.id, 1);
  assert.equal(blocked.status, 409);
  assert.equal((await blocked.json()).error.code, "FOLDER_IN_USE");
  const remove = (version, user = a) =>
    materials.remove(request("DELETE", `materials/${material.id}`, user, undefined, { version }), material.id);
  assert.equal((await remove(3, b)).status, 404);
  assert.equal((await remove(2)).status, 412);
  assert.equal((await remove(3)).status, 204);
  assert.equal((await create(body, key)).status, 404);
  assert.equal((await removeFolder(folder.id, 1)).status, 204);
});
