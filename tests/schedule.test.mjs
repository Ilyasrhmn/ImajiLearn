import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createRegistrationHandler } from "../apps/web/server/accounts/registration.mjs";
import { createFolderService } from "../apps/web/server/folders/service.mjs";
import { createScheduleHandlers } from "../apps/web/server/schedule/http.mjs";
import { testDatabase } from "./support/database.mjs";

test("schedule enforces session ownership, overlap, versions and folder references", async t => {
  const storage = await testDatabase();
  t.after(() => storage.close());
  for (const migration of storage.migrations) await storage.migrate(migration);
  const origin = "http://localhost:3000";
  const config = { origin, registerLimit: 20 };
  const api = createScheduleHandlers(storage.db, config);
  const folders = createFolderService(storage.db);
  function request(method, path, body, account, version, key = randomUUID()) {
    return new Request(`${origin}/api/v1/${path}`, {
      method,
      headers: { origin, "content-type": "application/json", "idempotency-key": key,
        ...(account ? { cookie: account.cookie } : {}), ...(version === undefined ? {} : { "if-match": `"${version}"` }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
  async function register(name) {
    const response = await createRegistrationHandler(storage.db, config)(request("POST", "auth/register",
      { name, email: `${name}@example.test`, password: "Synthetic password" }));
    assert.equal(response.status, 201);
    return { id: (await response.json()).data.user.id, cookie: response.headers.get("set-cookie").split(";")[0] };
  }
  const a = await register("schedule-a"), b = await register("schedule-b");
  const body = { year: 2026, semester: "1", className: "4A", day: 1, start: "07:00", end: "08:00", newSubject: "IPAS" };
  const path = "schedule?year=2026&semester=1";
  assert.equal((await api.get(request("GET", path))).status, 401);
  const key = randomUUID();
  const created = await api.create(request("POST", "schedule/slots", body, a, undefined, key));
  assert.equal(created.status, 201);
  const { term, createdFolder } = (await created.json()).data;
  const [slot] = term.entries;
  assert.equal(slot.start, "07:00");
  assert.equal(slot.folderId, createdFolder.id);
  assert.deepEqual((await (await api.create(request("POST", "schedule/slots", body, a, undefined, key))).json()).data.term, term);
  assert.deepEqual((await (await api.get(request("GET", path, undefined, b))).json()).data.entries, []);
  const { newSubject, ...periodAndSlot } = body;
  assert.equal(newSubject, "IPAS");
  const withFolder = { ...periodAndSlot, folderId: slot.folderId };
  assert.equal((await api.create(request("POST", "schedule/slots", withFolder, b))).status, 404);
  assert.equal((await api.create(request("POST", "schedule/slots", withFolder, a))).status, 409);
  const slotPath = `schedule/slots/${slot.id}`;
  assert.equal((await api.update(request("PATCH", slotPath, { className: "4B" }, b, 1), slot.id)).status, 404);
  assert.equal((await api.update(request("PATCH", slotPath, { className: "4B" }, a, 1), slot.id)).status, 200);
  assert.equal((await api.remove(request("DELETE", slotPath, undefined, a, 1), slot.id)).status, 412);
  await assert.rejects(folders.remove(a.id, createdFolder.id, createdFolder.resourceVersion), { code: "FOLDER_IN_USE" });
  assert.equal((await api.remove(request("DELETE", slotPath, undefined, a, 2), slot.id)).status, 204);
  assert.deepEqual((await (await api.get(request("GET", path, undefined, a))).json()).data.entries, []);
  await folders.remove(a.id, createdFolder.id, createdFolder.resourceVersion);
});
