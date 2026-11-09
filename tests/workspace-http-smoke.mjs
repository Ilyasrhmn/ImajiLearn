import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { syntheticPdf } from "./support/pdf.mjs";

const base = process.env.TEST_BASE_URL;
const origin = process.env.TEST_APP_ORIGIN;
if (!base || !origin) throw new Error("Set TEST_BASE_URL and TEST_APP_ORIGIN for an isolated test deployment.");

function send(path, { method = "GET", body, cookie, version, teacherId } = {}) {
  const multipart = body instanceof FormData;
  return fetch(`${base}/api/v1${path}`, {
    method,
    headers: {
      origin, ...(cookie ? { cookie } : {}), ...(teacherId ? { "x-teacher-id": teacherId } : {}),
      ...(body && !multipart ? { "content-type": "application/json" } : {}),
      ...(version !== undefined ? { "if-match": `"${version}"` } : {}),
      ...(method === "POST" ? { "idempotency-key": randomUUID() } : {}),
    },
    body: multipart || body === undefined ? body : JSON.stringify(body),
  });
}

async function data(response, status) {
  assert.equal(response.status, status);
  return (await response.json()).data;
}

async function account() {
  const response = await send("/auth/register", {
    method: "POST", body: { name: "Synthetic teacher", email: `workspace-${randomUUID()}@example.test`, password: "Synthetic password" },
  });
  const { user } = await data(response, 201);
  return { cookie: response.headers.get("set-cookie").split(";")[0], teacherId: user.id };
}

const a = await account();
const b = await account();
assert.equal((await send("/me", { ...b, teacherId: a.teacherId })).status, 409);
const profile = await data(await send("/me", { ...a, method: "PATCH", body: { school: "Sekolah Sintetis" } }), 200);
assert.equal(profile.school, "Sekolah Sintetis");

const folder = await data(await send("/folders", { ...a, method: "POST", body: { name: "IPAS" } }), 201);
const form = new FormData();
form.set("title", "Materi IPA");
form.set("folderId", folder.id);
form.set("file", new File(["Tumbuhan perlu air."], "tumbuhan.txt", { type: "text/plain" }));
const material = await data(await send("/materials", { ...a, method: "POST", body: form }), 201);
assert.equal(material.extractionStatus, "ready");
assert.equal(material.text, "Tumbuhan perlu air.");
assert.equal((await send(`/materials/${material.id}/file`, b)).status, 404);
assert.equal(await (await send(`/materials/${material.id}/file`, a)).text(), "Tumbuhan perlu air.");
assert.deepEqual((await data(await send("/materials?view=all", a), 200)).map(row => row.id), [material.id]);
assert.deepEqual(await data(await send("/materials?view=all", b), 200), []);
form.set("file", new File([syntheticPdf()], "tumbuhan.pdf", { type: "application/pdf" }));
const pdf = await data(await send("/materials", { ...a, method: "POST", body: form }), 201);
assert.equal(pdf.extractionStatus, "ready");
assert.match(pdf.text, /Tumbuhan perlu air\./);

const { term } = await data(await send("/schedule/slots", {
  ...a, method: "POST", body: { year: 2026, semester: "1", folderId: folder.id, className: "4A", day: 1, start: "07:00", end: "08:00" },
}), 201);
assert.equal(term.entries[0].folderId, folder.id);
assert.deepEqual((await data(await send("/schedule?year=2026&semester=1", b), 200)).entries, []);

const exam = await data(await send("/exams", {
  ...a, method: "POST", body: { type: "daily", subject: "IPAS", materialIds: [material.id] },
}), 201);
assert.equal(exam.header.school, "Sekolah Sintetis");
assert.equal((await send(`/exams/${exam.id}`, b)).status, 404);
const remedial = await data(await send(`/exams/${exam.id}/remedial`, { ...a, method: "POST" }), 201);
assert.equal(remedial.config.type, "remedial");
assert.notEqual(remedial.questions[0].id, exam.questions[0].id);
console.log("Workspace HTTP smoke passed: account binding, profile, folders, private upload/download, schedule and exams.");
