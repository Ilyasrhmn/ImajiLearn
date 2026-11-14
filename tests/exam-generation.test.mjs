import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createExamGeneration } from "../apps/web/server/exams/generation.mjs";
import { createExamService } from "../apps/web/server/exams/service.mjs";
import { createMaterialService } from "../apps/web/server/materials/service.mjs";
import { testDatabase } from "./support/database.mjs";

test("exam generation fills batches of blank slots while preserving manual edits and ownership", async () => {
  const storage = await testDatabase();
  try {
    for (const migration of storage.migrations) await storage.migrate(migration);
    const [owner, other] = await Promise.all(["owner", "other"].map(name =>
      storage.db.teacher.create({ data: { name, email: name + "@example.test", school: "PRIVATE_SCHOOL" } })));
    const source = await createMaterialService(storage.db).create(owner.id, {
      title: "Tumbuhan", text: "Akar menyerap air. Daun menggunakan cahaya matahari.",
    }, randomUUID());
    const exams = createExamService(storage.db);
    const exam = await exams.create(owner, {
      type: "daily", grade: "2", subject: "IPAS", difficulty: "mixed",
      materialIds: [source.id], counts: { multipleChoice: 3, shortAnswer: 2, essay: 2 },
    }, randomUUID());
    const manual = await exams.patch(owner.id, exam.id, {
      questions: exam.questions.map((question, index) => index === 0 ? { ...question, prompt: "Soal tulisan guru" } : question),
    }, exam.resourceVersion);
    const waiting = Promise.withResolvers(), release = Promise.withResolvers();
    let calls = 0;
    const generation = createExamGeneration(storage.db, async (feature, { messages }) => {
      assert.equal(feature, "exam");
      assert.match(messages[0].content, /rubric.*string.*bukan array/u);
      assert.doesNotMatch(messages[1].content, /PRIVATE_SCHOOL|@example/);
      const payload = JSON.parse(messages[1].content);
      assert.match(payload.sources[0].text, /Akar menyerap air/);
      assert.ok(payload.slots.length <= 5 && payload.slots.every(slot => slot.number > 1));
      const questions = payload.slots.map(slot => ({
        number: slot.number, prompt: "Pertanyaan " + slot.number,
        options: slot.optionCount ? ["A. Daun", "B) Akar", "C. Bunga"] : [],
        answer: slot.optionCount ? "B" : "Akar",
        explanation: "Akar menyerap air.", topic: "Tumbuhan",
        learningOutcome: "Mengenali bagian tumbuhan.", indicator: "Menjelaskan fungsi akar.",
        cognitiveLevel: "C2", rubric: slot.form === "essay" ? "Skor penuh jika fungsi akar dijelaskan." : "",
      }));
      calls++;
      if (calls === 1) questions[0].answer = "D";
      if (calls === 2) { waiting.resolve(); await release.promise; }
      return { content: { questions } };
    });
    await assert.rejects(generation.fill(other.id, exam.id, manual.resourceVersion), { status: 404 });
    await assert.rejects(generation.fill(owner.id, exam.id, exam.resourceVersion), { status: 412 });
    await assert.rejects(generation.fill(owner.id, exam.id, manual.resourceVersion), { code: "INVALID_EXAM_OUTPUT" });
    const pending = generation.fill(owner.id, exam.id, manual.resourceVersion);
    try {
      await Promise.race([waiting.promise, pending]);
      await assert.rejects(generation.fill(owner.id, exam.id, manual.resourceVersion), { code: "EXAM_GENERATION_IN_PROGRESS" });
    } finally { release.resolve(); }
    const partial = await pending;
    const complete = await generation.fill(owner.id, exam.id, partial.resourceVersion);
    assert.deepEqual(complete.questions[0], manual.questions[0]);
    assert.deepEqual(complete.questions[1].options, ["Daun", "Akar", "Bunga"]);
    assert.ok(complete.questions.every(question => question.prompt));
    assert.ok(complete.questions.slice(1).every(question => question.answer && question.indicator));
    assert.deepEqual(complete.questions.map(question => [question.id, question.difficulty, question.maxScore]),
      exam.questions.map(question => [question.id, question.difficulty, question.maxScore]));
    assert.deepEqual(await exams.get(owner.id, exam.id), complete);
    assert.deepEqual(await generation.fill(owner.id, exam.id, complete.resourceVersion), complete);
    assert.equal(calls, 3);
  } finally { await storage.close(); }
});
