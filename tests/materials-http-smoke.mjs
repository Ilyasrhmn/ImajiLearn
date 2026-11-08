import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const base = process.env.TEST_BASE_URL, origin = process.env.TEST_APP_ORIGIN;
if (!base || !origin) throw new Error("Set TEST_BASE_URL and TEST_APP_ORIGIN for an isolated test deployment.");
function send(method, path, body, cookie, headers = {}) {
  return fetch(`${base}/api/v1/${path}`, { method,
    headers: { ...(method === "GET" ? {} : { origin, "content-type": "application/json" }), ...(cookie ? { cookie } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function account() {
  const response = await send("POST", "auth/register", { name: "Synthetic Material Teacher", email: `materials-${randomUUID()}@example.test`, password: "Synthetic password" });
  assert.equal(response.status, 201);
  return response.headers.get("set-cookie").split(";")[0];
}
const a = await account(), b = await account();
const key = randomUUID(), body = { title: "HTTP manual material", text: "  Teks 🙂\nDipertahankan.  " };
const created = await send("POST", "materials", body, a, { "idempotency-key": key });
assert.equal(created.status, 201); assert.equal(created.headers.get("etag"), '"1"');
const material = (await created.json()).data;
assert.equal(material.text, body.text); assert.match(material.revision, /^[a-f\d]{64}$/);
const replay = await send("POST", "materials", body, a, { "idempotency-key": key });
assert.equal(replay.status, 201); assert.deepEqual((await replay.json()).data, material);
assert.equal((await send("GET", `materials/${material.id}`)).status, 401);
assert.equal((await send("GET", `materials/${material.id}`, undefined, b)).status, 404);
assert.equal((await send("PATCH", `materials/${material.id}`, { archived: true }, b, { "if-match": '"1"' })).status, 404);
const read = await send("GET", `materials/${material.id.toUpperCase()}`, undefined, a);
assert.equal(read.status, 200); assert.equal(read.headers.get("cache-control"), "no-store");
const archived = await send("PATCH", `materials/${material.id}`, { archived: true }, a, { "if-match": '"1"' });
assert.equal(archived.status, 200); assert.equal(archived.headers.get("etag"), '"2"');
assert.equal((await archived.json()).data.archived, true);
const preferences = await send("GET", `media-preferences?materialIds=${material.id.toUpperCase()}`, undefined, a);
assert.equal(preferences.status, 200); assert.equal(preferences.headers.get("cache-control"), "no-store");
assert.deepEqual(await preferences.json(), { data: [{ materialId: material.id, selectedMedia: [], songTemplateId: "balonku", resourceVersion: 0, updatedAt: null }], page: { nextCursor: null } });
assert.equal((await send("GET", `media-preferences?materialIds=${material.id}`, undefined, b)).status, 404);
assert.equal((await send("GET", `media-preferences?materialIds=${material.id}&materialIds=${material.id}`, undefined, a)).status, 422);
assert.equal((await send("PATCH", `materials/${material.id}`, { archived: false }, a, { "if-match": '"1"' })).status, 412);
const restored = await send("PATCH", `materials/${material.id}`, { archived: false }, a, { "if-match": '"2"' });
assert.equal(restored.status, 200); assert.equal((await restored.json()).data.revision, material.revision);
console.log("Materials/preference-read HTTP smoke passed: text, replay, ownership, ETags, archive/restore, default preference batch.");
