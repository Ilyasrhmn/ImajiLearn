import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { syntheticPdf } from "./support/pdf.mjs";
import { expectPageRedirect, expectPageNotFound } from "./support/page-response.mjs";

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
const pdfUpload = new FormData();
pdfUpload.set("title", "PDF preview ownership");
pdfUpload.set("file", new Blob([syntheticPdf({ figure: true })], { type: "application/pdf" }), "source.pdf");
const uploaded = await fetch(`${base}/api/v1/materials`, { method: "POST", body: pdfUpload,
  headers: { origin, cookie: a, "idempotency-key": randomUUID() } });
assert.equal(uploaded.status, 201);
const pdfId = (await uploaded.json()).data.id;
const pdfPath = `materials/${pdfId}/source?page=1`;
assert.equal((await send("GET", pdfPath)).status, 401);
assert.equal((await send("GET", pdfPath, undefined, b)).status, 404);
const pdfPreview = await send("GET", pdfPath, undefined, a);
assert.equal(pdfPreview.status, 200);
assert.equal(pdfPreview.headers.get("cache-control"), "no-store");
const preview = (await pdfPreview.json()).data;
assert.equal(preview.page, 1);
assert.match(preview.preview, /^data:image\/jpeg;base64,/);
assert.equal((await send("GET", `materials/${pdfId}/source?page=2`, undefined, a)).status, 404);
const key = randomUUID(), body = { title: "HTTP manual material", text: "  Teks 🙂\nDipertahankan.  " };
const created = await send("POST", "materials", body, a, { "idempotency-key": key });
assert.equal(created.status, 201); assert.equal(created.headers.get("etag"), '"1"');
const material = (await created.json()).data;
assert.equal(material.text, body.text); assert.match(material.revision, /^[a-f\d]{64}$/);
const materialPage = `${base}/materi/${material.id}`;
assert.equal((await send("GET", `materials/${material.id}/slides/illustrations`, undefined, a)).status, 405);
const anonymous = await fetch(materialPage, { redirect: "manual" });
await expectPageRedirect(anonymous, "/masuk");
await expectPageNotFound(await fetch(materialPage, { headers: { cookie: b } }));
await expectPageNotFound(await fetch(`${materialPage}/reading`, { headers: { cookie: b } }));
await expectPageNotFound(await fetch(`${materialPage}/unknown`, { headers: { cookie: a } }));
const detailPage = await fetch(materialPage, { headers: { cookie: a } });
assert.equal(detailPage.status, 200);
assert.match(await detailPage.text(), /HTTP manual material/);
for (const segment of ["reading", "visual", "slides", "song"]) {
  const tabPage = await fetch(`${materialPage}/${segment}`, { headers: { cookie: a }, redirect: "manual" });
  assert.equal(tabPage.status, 200);
  assert.equal(tabPage.headers.get("location"), null);
  const html = await tabPage.text();
  assert.match(html, /Media materi/);
  assert.doesNotMatch(html, /NEXT_REDIRECT/);
}
const readingStudio = await fetch(`${base}/bacaan`, { headers: { cookie: a }, redirect: "manual" });
assert.equal(readingStudio.status, 200);
assert.match(await readingStudio.text(), /Bacaan bergambar/);
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
