import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { testDatabase } from "./support/database.mjs";
import { createMaterialService } from "../apps/web/server/materials/service.mjs";
import { createMaterialReading } from "../apps/web/server/materials/reading.mjs";
import { createMaterialSlides } from "../apps/web/server/materials/slides.mjs";
import { createMaterialVisual } from "../apps/web/server/materials/visual.mjs";
import { createMaterialSongs } from "../apps/web/server/materials/songs.mjs";
import { createPreparedLesson } from "../apps/web/server/materials/prepared-lesson.mjs";
import { createExamService } from "../apps/web/server/exams/service.mjs";
import { createExamGeneration } from "../apps/web/server/exams/generation.mjs";
import { endpoint } from "../apps/web/server/core/http.mjs";
import { repairAIRequest } from "../apps/web/server/ai/repair-context.mjs";
import { generateMaterialMedia } from "../apps/web/lib/material-media.mjs";
import { generateExamQuestions } from "../packages/shared/lib/exam-generation.mjs";
import { proxyBackend } from "../apps/pwa/lib/backend-proxy.mjs";

const origin = "https://backend.example.test", pwa = "https://pwa.example.test";
const sourceText = "Bangun ruang kubus memiliki enam sisi berbentuk persegi. Akar menyerap air. Daun menggunakan cahaya untuk membuat gula.";
const reading = { title: "Tumbuhan", sections: [{ heading: "Daun", paragraphs: ["Daun menggunakan cahaya untuk membuat gula."] }],
  quiz: [{ question: "Apa yang dibuat daun?", options: ["Gula", "Garam", "Batu"], answerIndex: 0, explanation: "Daun membuat gula." }] };
const slides = { title: "Tumbuhan", slides: [{ title: "Daun", points: ["Daun memakai cahaya."] }] };
const lyrics = { title: "Daun hijau", learningPoints: ["Daun memakai cahaya."], sections: [
  { type: "verse", lines: ["Ayo lihat daun di sekitar kita", "Daun hijau memakai cahaya matahari"] },
  { type: "chorus", lines: ["Daun membuat gula setiap hari", "Ayo belajar bersama teman kita"] },
  { type: "verse", lines: ["Akar menyerap air dari tanah", "Air naik menuju daun hijau"] },
] };

test("web and PWA repair invalid text, visual, lyrics, and image plans before exposing saved results", async t => {
  const storage = await testDatabase();
  try {
    for (const migration of storage.migrations) await storage.migrate(migration);
    const owner = await storage.db.teacher.create({ data: { name: "Repair QA", email: "repair@example.test" } });
    let active;
    t.mock.method(globalThis, "fetch", async (url, options) => {
      if (options.method !== "POST") return Response.json({ data: [] });
      const headers = { ...options.headers, origin: active.mobile ? pwa : origin };
      const request = new Request((active.mobile ? pwa : origin) + url, { ...options, headers });
      if (!active.mobile) return active.handler(request);
      return proxyBackend(request, { params: Promise.resolve({ path: new URL(request.url).pathname.split("/").slice(3) }) }, {
        NODE_ENV: "production", PWA_BACKEND_ORIGIN: origin, PWA_BACKEND_PUBLIC_ORIGIN: origin, PWA_PUBLIC_ORIGIN: pwa,
      }, (url, init) => active.handler(new Request(url, init)));
    });

    for (const feature of ["reading", "slides", "mindmap", "song"]) {
      await t.test(feature, async () => {
        const source = await createMaterialService(storage.db).create(owner.id, { title: feature, text: sourceText }, randomUUID());
        const calls = { text: 0, routing: 0, imagePlan: 0, image: 0, music: 0 };
        const invalidCode = { reading: "INVALID_READING", slides: "INVALID_SLIDES", mindmap: "INVALID_VISUAL", song: "INVALID_SONG_LYRICS" }[feature];
        const generate = async (_, original) => {
          const request = repairAIRequest(original), input = JSON.parse(request.messages[1].content);
          const stage = input.purpose === "illustration-routing" ? "routing" : input.lines ? "imagePlan" : "text";
          if (++calls[stage] === 1) return { content: {} };
          assert.match(request.messages[0].content, new RegExp(stage === "text" ? invalidCode : "INVALID_ILLUSTRATION_PLAN"));
          if (stage === "routing") return { content: { sections: [{ index: 0, complexity: "complex", priority: 100 }] } };
          if (stage === "imagePlan") return { content: { figureId: null, generate: true, subject: "A green leaf", composition: "Sunlight reaches the leaf.", details: "A living plant with roots." } };
          return { content: feature === "reading" ? reading : feature === "slides" ? slides : feature === "song" ? lyrics
            : { kind: "geometry", title: "Kubus", shapes: [{ shape: "cube", evidence: "Bangun ruang kubus memiliki enam sisi berbentuk persegi.", detail: "Enam sisi persegi." }] } };
        };
        let service;
        if (feature === "song") service = createMaterialSongs(storage.db, generate, {
          create: async () => { calls.music++; return "saved-paid-task"; },
        });
        else if (feature === "mindmap") service = createMaterialVisual(storage.db, generate);
        else {
          const textService = feature === "reading" ? createMaterialReading(storage.db, generate) : createMaterialSlides(storage.db, generate);
          service = createPreparedLesson(storage.db, textService, feature, async () => { calls.image++; return Buffer.from("saved image bytes"); }, generate);
        }
        const handler = endpoint(async () => Response.json({ data: await service[feature === "song" ? "start" : "generate"](owner.id, source.id) }), origin);
        active = { handler, mobile: feature !== "reading" };
        const data = await generateMaterialMedia(owner.id, `/materials/${source.id}/${feature}`, source.id, feature);
        assert.equal(calls.text, 2);
        if (["reading", "slides"].includes(feature)) {
          assert.deepEqual(calls, { text: 2, routing: 2, imagePlan: 2, image: 1, music: 0 });
          assert.ok(data.illustrations.every(item => item.ready));
          const again = await generateMaterialMedia(owner.id, `/materials/${source.id}/${feature}`, source.id, feature);
          assert.deepEqual(again, data);
          assert.equal(calls.image, 1);
        } else if (feature === "song") {
          assert.equal(data.status, "generating");
          assert.equal(calls.music, 1);
          await generateMaterialMedia(owner.id, `/materials/${source.id}/song`, source.id, feature);
          assert.equal(calls.music, 1);
        } else assert.equal(data.kind, "geometry");
      });
    }

    await t.test("exam", async () => {
      const source = await createMaterialService(storage.db).create(owner.id, { title: "Tumbuhan", text: sourceText }, randomUUID());
      const exam = await createExamService(storage.db).create(owner, { type: "daily", grade: "2", subject: "IPAS", difficulty: "mixed",
        materialIds: [source.id], counts: { multipleChoice: 1, shortAnswer: 1, essay: 1 } }, randomUUID());
      let calls = 0;
      const service = createExamGeneration(storage.db, async (_, original) => {
        const request = repairAIRequest(original), payload = JSON.parse(request.messages[1].content);
        if (++calls === 1) return { content: { questions: [] } };
        assert.match(request.messages[0].content, /INVALID_EXAM_OUTPUT/);
        return { content: { questions: payload.slots.map(slot => ({ number: slot.number, prompt: "Pertanyaan " + slot.number,
          options: slot.optionCount ? ["Daun", "Akar", "Bunga"].slice(0, slot.optionCount) : [], answer: slot.optionCount ? "B" : "Akar",
          explanation: "Akar menyerap air.", topic: "Tumbuhan", learningOutcome: "Mengenali tumbuhan.", indicator: "Menjelaskan akar.",
          cognitiveLevel: "C2", rubric: slot.form === "essay" ? "Jawaban menjelaskan akar." : "" })) } };
      });
      active = { mobile: true, handler: endpoint(async request => Response.json({ data: await service.fill(owner.id, exam.id,
        Number(request.headers.get("if-match").replaceAll('"', ""))) }), origin) };
      const result = await generateExamQuestions(owner.id, exam, { signal: new AbortController().signal, onDocument() {}, onProgress() {} });
      assert.equal(calls, 2);
      assert.ok(result.questions.every(question => question.prompt.trim()));
    });
  } finally { await storage.close(); }
});
