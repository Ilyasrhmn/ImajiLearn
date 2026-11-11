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
const materialPage = `${base}/materi/${material.id}`;
const anonymous = await fetch(materialPage, { redirect: "manual" });
assert.equal(anonymous.status, 307);
assert.equal(anonymous.headers.get("location"), "/masuk");
assert.equal((await fetch(materialPage, { headers: { cookie: b } })).status, 404);
assert.equal((await fetch(`${materialPage}/reading`, { headers: { cookie: b } })).status, 404);
assert.equal((await fetch(`${materialPage}/unknown`, { headers: { cookie: a } })).status, 404);
const detailPage = await fetch(materialPage, { headers: { cookie: a } });
assert.equal(detailPage.status, 200);
assert.match(await detailPage.text(), /HTTP manual material/);
for (const segment of ["reading", "visual", "slides", "song"]) {
  assert.equal((await fetch(`${materialPage}/${segment}`, { headers: { cookie: a } })).status, 200);
}
const replay = await send("POST", "materials", body, a, { "idempotency-key": key });
assert.equal(replay.status, 201); assert.deepEqual((await replay.json()).data, material);
assert.equal((await send("GET", `materials/${material.id}`)).status, 401);
assert.equal((await send("GET", `materials/${material.id}`, undefined, b)).status, 404);
assert.equal((await send("PATCH", `materials/${material.id}`, { archived: true }, b, { "if-match": '"1"' })).status, 404);
const read = await send("GET", `materials/${material.id.toUpperCase()}`, undefined, a);
assert.equal(read.status, 200); assert.equal(read.headers.get("cache-control"), "no-store");
const initialPreference = await send("GET", `media-preferences?materialIds=${material.id}`, undefined, a);
assert.equal((await initialPreference.json()).data[0].resourceVersion, 0);
const savedPreference = await send("PUT", `media-preferences/${material.id.toUpperCase()}`, { selectedMedia: ["song", "reading"], songTemplateId: "cicak_dinding" }, a, { "if-match": '"0"' });
assert.equal(savedPreference.status, 200); assert.equal(savedPreference.headers.get("etag"), '"1"');
assert.deepEqual((await savedPreference.json()).data.selectedMedia, ["reading", "song"]);
const clearedPreference = await send("PUT", `media-preferences/${material.id}`, { selectedMedia: [], songTemplateId: "potong_bebek" }, a, { "if-match": '"1"' });
assert.equal(clearedPreference.status, 200); assert.equal(clearedPreference.headers.get("etag"), '"2"');
const persistedPreference = (await clearedPreference.json()).data;
assert.equal((await send("PUT", `media-preferences/${material.id}`, { selectedMedia: [] }, b, { "if-match": '"2"' })).status, 404);
assert.equal((await send("PUT", `media-preferences/${material.id}`, { selectedMedia: [] }, a, { "if-match": '"1"' })).status, 412);
const archived = await send("PATCH", `materials/${material.id}`, { archived: true }, a, { "if-match": '"1"' });
assert.equal(archived.status, 200); assert.equal(archived.headers.get("etag"), '"2"');
assert.equal((await archived.json()).data.archived, true);
const preferences = await send("GET", `media-preferences?materialIds=${material.id.toUpperCase()}`, undefined, a);
assert.equal(preferences.status, 200); assert.equal(preferences.headers.get("cache-control"), "no-store");
assert.deepEqual(await preferences.json(), { data: [persistedPreference], page: { nextCursor: null } });
assert.equal((await send("PUT", `media-preferences/${material.id}`, { selectedMedia: ["slides"] }, a, { "if-match": '"2"' })).status, 409);
assert.equal((await send("GET", `media-preferences?materialIds=${material.id}`, undefined, b)).status, 404);
assert.equal((await send("GET", `media-preferences?materialIds=${material.id}&materialIds=${material.id}`, undefined, a)).status, 422);
assert.equal((await send("PATCH", `materials/${material.id}`, { archived: false }, a, { "if-match": '"1"' })).status, 412);
const restored = await send("PATCH", `materials/${material.id}`, { archived: false }, a, { "if-match": '"2"' });
assert.equal(restored.status, 200); assert.equal((await restored.json()).data.revision, material.revision);
const restoredPreference = await send("PUT", `media-preferences/${material.id}`, { selectedMedia: ["slides"] }, a, { "if-match": '"2"' });
assert.equal(restoredPreference.status, 200); assert.equal(restoredPreference.headers.get("etag"), '"3"');
assert.equal((await restoredPreference.json()).data.songTemplateId, "balonku");
console.log("Materials/preference HTTP smoke passed: text, replay, GET/PUT, empty selections, ownership, ETags, archive/restore.");
