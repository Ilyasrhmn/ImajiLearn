import assert from "node:assert/strict";
import { test } from "node:test";
import { createExam, initialExamConfig, isBlankExamQuestion } from "../packages/shared/lib/exams.mjs";
import { generateExamQuestions } from "../packages/shared/lib/exam-generation.mjs";

function draft() {
  return { ...createExam({ ...initialExamConfig(), subject: "IPAS", summary: "Tumbuhan", counts: { multipleChoice: 2, shortAnswer: 1, essay: 1 } }), resourceVersion: 7 };
}

test("exam generation waits through provider timeouts and resumes the same saved batch", async t => {
  const exam = draft(), versions = [];
  t.mock.method(globalThis, "setTimeout", callback => { queueMicrotask(callback); return 0; });
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (_, options) => {
    versions.push(options.headers["If-Match"]);
    if (++calls < 4) return Response.json({ error: { code: "PROVIDER_TIMEOUT", message: "Waiting" } }, { status: 503 });
    return Response.json({ data: { ...exam, resourceVersion: 8, questions: exam.questions.map(q => ({ ...q, prompt: "Saved" })) } });
  });
  const result = await generateExamQuestions("teacher", exam, { signal: new AbortController().signal, onDocument() {}, onProgress() {} });
  assert.equal(result.resourceVersion, 8);
  assert.deepEqual(versions, ['"7"', '"7"', '"7"', '"7"']);
});

test("a gateway timeout reloads persisted exam progress before another batch", async t => {
  const exam = draft(), saved = { ...draft(), id: exam.id, resourceVersion: 8 };
  saved.questions[0].prompt = "Saved before gateway timeout";
  const methods = [];
  t.mock.method(globalThis, "setTimeout", callback => { queueMicrotask(callback); return 0; });
  t.mock.method(globalThis, "fetch", async (_, options) => {
    methods.push(options.method);
    if (methods.length === 1) return new Response("Gateway timeout", { status: 504 });
    if (options.method === "GET") return Response.json({ data: saved });
    assert.equal(options.headers["If-Match"], '"8"');
    return Response.json({ data: { ...saved, resourceVersion: 9, questions: saved.questions.map(q => ({ ...q, prompt: q.prompt || "Generated" })) } });
  });
  const result = await generateExamQuestions("teacher", exam, { signal: new AbortController().signal, onDocument() {}, onProgress() {} });
  assert.deepEqual(methods, ["POST", "GET", "POST"]);
  assert.equal(result.questions[0].prompt, saved.questions[0].prompt);
});

test("PWA generation fills successive batches with the latest version and keeps manual edits", async t => {
  const exam = draft();
  exam.questions[0].prompt = "Soal guru";
  const manual = structuredClone(exam.questions[0]);
  const versions = [], documents = [], progress = [];
  let current = exam;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, `/api/v1/exams/${exam.id}/generate`);
    assert.equal(options.method, "POST");
    assert.equal(options.headers["X-Teacher-Id"], "teacher");
    versions.push(options.headers["If-Match"]);
    const firstBlank = current.questions.findIndex(isBlankExamQuestion);
    current = { ...current, resourceVersion: current.resourceVersion + 1, questions: current.questions.map((q, index) => index === firstBlank ? { ...q, prompt: "Generated" } : q) };
    return Response.json({ data: current });
  });
  const result = await generateExamQuestions("teacher", exam, { signal: new AbortController().signal,
    onDocument: data => documents.push(data), onProgress: data => progress.push(data) });
  assert.deepEqual(versions, ['"7"', '"8"', '"9"']);
  assert.equal(documents.length, 3);
  assert.deepEqual(progress, [{ filled: 1, total: 3 }, { filled: 2, total: 3 }, { filled: 3, total: 3 }]);
  assert.deepEqual(result.questions[0], manual);
  assert.equal(result.questions.filter(isBlankExamQuestion).length, 0);
});

test("PWA generation stops after cancellation or a response that makes no progress", async t => {
  const exam = draft(), controller = new AbortController();
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; return Response.json({ data: exam }); });
  const unchanged = await generateExamQuestions("teacher", exam, { signal: controller.signal, onDocument() {}, onProgress() { assert.fail("No progress expected"); } });
  assert.equal(calls, 1);
  assert.deepEqual(unchanged, exam);
  calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return Response.json({ data: { ...exam, questions: exam.questions.map((q, index) => index === 0 ? { ...q, prompt: "Generated" } : q) } });
  });
  const partial = await generateExamQuestions("teacher", exam, { signal: controller.signal, onDocument() { controller.abort(); }, onProgress() {} });
  assert.equal(calls, 1);
  assert.equal(partial.questions[0].prompt, "Generated");
  assert.equal(partial.questions.filter(isBlankExamQuestion).length, 3);
});

test("PWA generation preserves partial results and exposes conflicts or offline errors for recovery", async t => {
  const exam = draft(), documents = [];
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    if (++calls === 1) return Response.json({ data: { ...exam, resourceVersion: 8,
      questions: exam.questions.map((q, index) => index === 0 ? { ...q, prompt: "Saved batch" } : q) } });
    return Response.json({ error: { code: "RESOURCE_CHANGED", message: "Naskah berubah" } }, { status: 412 });
  });
  await assert.rejects(generateExamQuestions("teacher", exam, { signal: new AbortController().signal,
    onDocument: data => documents.push(data), onProgress() {} }), error => error.status === 412 && error.code === "RESOURCE_CHANGED");
  assert.equal(documents.length, 1);
  assert.equal(documents[0].resourceVersion, 8);
  assert.equal(documents[0].questions[0].prompt, "Saved batch");
  t.mock.method(globalThis, "fetch", async () => { throw new TypeError("Failed to fetch"); });
  await assert.rejects(generateExamQuestions("teacher", exam, { signal: new AbortController().signal,
    onDocument() { assert.fail("No document expected"); }, onProgress() {} }), /Periksa koneksi/);
});

test("automatic fill excludes questions containing any teacher content", () => {
  const question = draft().questions[0];
  assert.equal(isBlankExamQuestion(question), true);
  for (const field of ["prompt", "answer", "explanation", "rubric", "topic", "learningOutcome", "indicator"]) {
    assert.equal(isBlankExamQuestion({ ...question, [field]: "Teacher text" }), false, field);
  }
  assert.equal(isBlankExamQuestion({ ...question, options: ["", "Teacher option", ""] }), false);
});
