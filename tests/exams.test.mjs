import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { createRegistrationHandler } from "../apps/web/server/accounts/registration.mjs";
import { createExamHandlers } from "../apps/web/server/exams/http.mjs";
import { testDatabase } from "./support/database.mjs";

const origin = "http://localhost:3000";
const config = { origin };
const draft = { type: "daily", subject: "IPAS", grade: "2", counts: { multipleChoice: 2, shortAnswer: 1, essay: 0 }, summary: "Sumber latihan." };
let storage, exams, teacher, foreign, document;

function req(method, path, { cookie, body, headers = {} } = {}) {
  return new Request(`${origin}/api/v1/${path}`, { method,
    headers: { origin, "content-type": "application/json", ...(cookie ? { cookie } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

async function register(name) {
  const response = await createRegistrationHandler(storage.db, config)(req("POST", "auth/register", {
    body: { name, email: `${name}@example.test`, password: "Synthetic password" },
  }));
  assert.equal(response.status, 201);
  return { ...(await response.json()).data.user, cookie: response.headers.get("set-cookie").split(";")[0] };
}

function create(body, key = randomUUID()) {
  return exams.create(req("POST", "exams", { cookie: teacher.cookie, body, headers: { "idempotency-key": key } }));
}

before(async () => {
  storage = await testDatabase();
  for (const migration of storage.migrations) await storage.migrate(migration);
  exams = createExamHandlers(storage.db, config);
  teacher = await register("exam-owner");
  foreign = await register("exam-foreign");
  await storage.db.teacher.update({ where: { id: teacher.id }, data: { school: "SD Negeri" } });
});
after(async () => { await storage?.close(); });

test("creates an empty draft from trusted profile and owned source, with idempotent replay", async () => {
  const material = await storage.db.material.create({ data: { userId: teacher.id, title: "Materi", text: "Sumber asli", revision: "a".repeat(64) } });
  const key = randomUUID();
  const response = await create({ ...draft, materialIds: [material.id] }, key);
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("etag"), '"1"');
  document = (await response.json()).data;
  assert.equal(document.header.school, "SD Negeri");
  assert.deepEqual(document.questions.map(question => question.options.length), [3, 3, 0]);
  assert.equal(document.questions.reduce((score, question) => score + question.maxScore, 0), 100);
  assert.equal(new Set(document.questions.map(question => question.id)).size, 3);
  assert.ok(document.questions.every(question => question.prompt === ""));
  assert.equal(document.sourceSnapshots, undefined);
  const saved = await storage.db.examDocument.findUnique({ where: { id: document.id } });
  assert.equal(saved.sourceSnapshots[0].text, "Sumber asli");
  assert.deepEqual((await (await create({ ...draft, materialIds: [material.id] }, key)).json()).data, document);
  assert.equal((await create({ ...draft, subject: "Lainnya" }, key)).status, 409);
  assert.equal((await create({ ...draft, materialIds: [material.id, material.id.toUpperCase()] })).status, 422);
  await storage.db.material.update({ where: { id: material.id }, data: { archived: true, text: "Berubah" } });
  assert.equal((await create({ ...draft, materialIds: [material.id] })).status, 409);
  const unchanged = await storage.db.examDocument.findUnique({ where: { id: document.id } });
  assert.equal(unchanged.sourceSnapshots[0].text, "Sumber asli");
});

test("enforces account ownership for source, listing, detail, patch and removal", async () => {
  const material = await storage.db.material.create({ data: { userId: foreign.id, title: "Rahasia", text: "Asing", revision: "b".repeat(64) } });
  assert.equal((await create({ ...draft, materialIds: [material.id] })).status, 404);
  assert.equal((await exams.list(req("GET", "exams"))).status, 401);
  const list = await exams.list(req("GET", "exams?q=sd&grade=2", { cookie: teacher.cookie }));
  const { data } = await list.json();
  assert.equal(data.length, 1);
  assert.equal(data[0].id, document.id);
  assert.equal(data[0].questions, undefined);
  assert.deepEqual((await (await exams.list(req("GET", "exams", { cookie: foreign.cookie }))).json()).data, []);
  for (const [method, handler] of [["GET", "get"], ["PATCH", "patch"], ["DELETE", "remove"]]) {
    const response = await exams[handler](req(method, `exams/${document.id}`, { cookie: foreign.cookie,
      headers: { "if-match": '"1"' }, ...(method === "PATCH" ? { body: { title: "Asing" } } : {}) }), document.id);
    assert.equal(response.status, 404);
  }
});

test("rejects stale and invalid edits while preserving question identity and version", async () => {
  const path = `exams/${document.id}`;
  const edit = (body, version = 1) => exams.patch(req("PATCH", path, { cookie: teacher.cookie, body,
    headers: { "if-match": `"${version}"` } }), document.id);
  const modified = structuredClone(document.questions);
  modified[0].id = randomUUID();
  assert.equal((await edit({ questions: modified })).status, 422);
  modified[0].id = document.questions[0].id;
  modified[0].answer = "D";
  assert.equal((await edit({ questions: modified })).status, 422);
  modified[0].answer = "A";
  modified[0].prompt = "Apa yang dipelajari?";
  const saved = await edit({ title: "Latihan", questions: modified });
  assert.equal(saved.status, 200);
  assert.equal(saved.headers.get("etag"), '"2"');
  assert.equal((await saved.json()).data.questions[0].prompt, modified[0].prompt);
  assert.equal((await edit({ title: "Usang" })).status, 412);
  const remove = version => exams.remove(req("DELETE", path, { cookie: teacher.cookie,
    headers: { "if-match": `"${version}"` } }), document.id);
  assert.equal((await remove(1)).status, 412);
  assert.equal((await remove(2)).status, 204);
  assert.equal((await exams.get(req("GET", path, { cookie: teacher.cookie }), document.id)).status, 404);
});

test("enforces the per-teacher draft limit and allows a retry after capacity is freed", async () => {
  const drafts = [];
  for (let index = 0; index < 20; index++) {
    const response = await create(draft);
    assert.equal(response.status, 201);
    drafts.push((await response.json()).data);
  }
  const retryKey = randomUUID();
  const full = await create(draft, retryKey);
  assert.equal(full.status, 409);
  assert.equal((await full.json()).error.code, "EXAM_LIMIT_REACHED");
  const removed = await exams.remove(req("DELETE", `exams/${drafts[0].id}`, {
    cookie: teacher.cookie, headers: { "if-match": '"1"' },
  }), drafts[0].id);
  assert.equal(removed.status, 204);
  assert.equal((await create(draft, retryKey)).status, 201);
  assert.equal(await storage.db.examDocument.count({ where: { userId: teacher.id } }), 20);
});
