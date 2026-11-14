import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { testDatabase } from "./support/database.mjs";
import { createMaterialService } from "../apps/web/server/materials/service.mjs";
import { createMaterialSlides } from "../apps/web/server/materials/slides.mjs";
import { createMaterialReading } from "../apps/web/server/materials/reading.mjs";
import { createSlideIllustrations } from "../apps/web/server/materials/slide-illustrations.mjs";
import { createPreparedLesson } from "../apps/web/server/materials/prepared-lesson.mjs";
import { budgetedImageGenerator } from "../apps/web/server/materials/image-routing.mjs";

test("reading and slides preserve all sections, persist allocation, and run both providers within the paid budget", async () => {
  const storage = await testDatabase();
  try {
    for (const migration of storage.migrations) await storage.migrate(migration);
    const owner = await storage.db.teacher.create({ data: { name: "Guru", email: "hybrid@example.test" } });
    const other = await storage.db.teacher.create({ data: { name: "Lain", email: "hybrid-other@example.test" } });
    const source = await createMaterialService(storage.db).create(owner.id, { title: "Tumbuhan", text: "Akar menyerap air. Daun menerima cahaya." }, randomUUID());
    const image = Uint8Array.of(255, 216, 255, 217);
    for (const feature of ["slides", "reading"]) {
      const reading = feature === "reading";
      const count = reading ? 16 : 23;
      const entries = Array.from({ length: count }, (_, index) => reading
        ? { heading: "Bagian " + index, paragraphs: ["Akar menyerap air."] }
        : { title: "Bagian " + index, points: ["Akar menyerap air."] });
      const content = { title: "Tumbuhan", ...(reading ? { sections: entries, quiz: [{ question: "Apa yang diserap akar?", options: ["Air", "Cahaya", "Udara"], answerIndex: 0, explanation: "Akar menyerap air." }] } : { slides: entries }) };
      let planning = 0;
      const plan = async (_feature, { messages }) => {
        const input = JSON.parse(messages[1].content);
        if (input.purpose === "illustration-routing") {
          planning++;
          return { content: { sections: input.sections.map(({ index }) => ({ index, complexity: index < 2 ? "simple" : "complex", priority: index })) } };
        }
        return { content: { generate: true, figureId: null, subject: "A plant", composition: "A plant showing roots and leaves", details: "Show the water entering the roots" } };
      };
      const calls = [], active = { "z-image": 0, cloudflare: 0 }, peak = { "z-image": 0, cloudflare: 0 };
      let overlap = false;
      const bothProviders = Promise.withResolvers();
      let overlapTimer;
      const generate = async (_prompt, task) => {
        calls.push(task.provider);
        active[task.provider]++;
        peak[task.provider] = Math.max(peak[task.provider], active[task.provider]);
        if (active.cloudflare && active["z-image"]) {
          overlap = true;
          clearTimeout(overlapTimer);
          bothProviders.resolve();
        } else if (!overlapTimer && !overlap) {
          overlapTimer = setTimeout(() => bothProviders.reject(new Error("Both image providers must start before either completes")), 5000);
        }
        // Hold the first batch until both providers arrive, independent of database timing.
        try { await bothProviders.promise; return image; }
        finally { active[task.provider]--; }
      };
      const text = reading ? createMaterialReading(storage.db, async () => ({ content })) : createMaterialSlides(storage.db, async () => ({ content }));
      const prepared = createPreparedLesson(storage.db, text, feature, generate, plan);
      await assert.rejects(prepared.generate(other.id, source.id), { status: 404 });
      let result;
      do { result = await prepared.generate(owner.id, source.id); } while (result.status === "preparing");
      assert.equal(result.illustrations.length, count);
      assert.ok(result.illustrations.every(status => status.ready));
      assert.equal(calls.filter(p => p === "z-image").length, 13);
      assert.equal(calls.filter(p => p === "cloudflare").length, count - 13);
      assert.ok(overlap);
      assert.ok(peak["z-image"] >= 1 && peak["z-image"] <= 2);
      assert.ok(peak.cloudflare >= 1 && peak.cloudflare <= 2);
      assert.equal(planning, 1);
      assert.deepEqual(await prepared.generate(owner.id, source.id), result);
      if (!reading) {
        const illustration = createSlideIllustrations(storage.db, generate, plan);
        await illustration.generate(owner.id, source.id, source.revision, count - 1, true);
        assert.equal(calls.at(-1), "cloudflare", "Manual replacement cannot exceed thirteen paid requests");
      }
      const row = await storage.db[reading ? "materialReading" : "materialSlideDeck"].findFirst({ where: { materialId: source.id } });
      assert.equal(row.zImageRequests, 13);
    }
  } finally { await storage.close(); }
});

test("concurrent claims cannot exceed thirteen and resuming a paid task does not spend another slot", async () => {
  const storage = await testDatabase();
  try {
    for (const migration of storage.migrations) await storage.migrate(migration);
    const teacher = await storage.db.teacher.create({ data: { name: "Guru", email: "budget@example.test" } });
    const source = await createMaterialService(storage.db).create(teacher.id, { title: "Daun", text: "Daun menerima cahaya." }, randomUUID());
    await storage.db.materialSlideDeck.create({ data: { materialId: source.id, revision: source.revision, zImageRequests: 12, content: { title: "Daun", slides: [] } } });
    const reservations = await Promise.all([0, 1].map(async slideIndex => {
      const reservation = { materialId: source.id, revision: source.revision, slideIndex, leaseId: randomUUID() };
      await storage.db.materialSlideIllustration.create({ data: { ...reservation, leaseUntil: new Date(Date.now() + 60_000) } });
      return reservation;
    }));
    const providers = await Promise.all(reservations.map(reservation => budgetedImageGenerator(storage.db, "slides", reservation, "z-image", async (_prompt, task) => task.provider)("A leaf")));
    assert.deepEqual(providers.sort(), ["cloudflare", "z-image"]);
    const paid = await storage.db.materialSlideIllustration.findFirst({ where: { materialId: source.id, imageProvider: "z-image" } });
    const resumed = await budgetedImageGenerator(storage.db, "slides", { materialId: paid.materialId, revision: paid.revision, slideIndex: paid.slideIndex, leaseId: paid.leaseId }, "cloudflare", async (_prompt, task) => task.provider)(null, { taskId: "saved-task" });
    assert.equal(resumed, "z-image");
    assert.equal((await storage.db.materialSlideDeck.findFirst({ where: { materialId: source.id } })).zImageRequests, 13);
  } finally { await storage.close(); }
});

test("Cloudflare quota exhaustion falls back beyond thirteen for reading and slides without resubmitting saved paid tasks", async () => {
  const storage = await testDatabase();
  const png = Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.alloc(40)]);
  try {
    for (const migration of storage.migrations) await storage.migrate(migration);
    const owner = await storage.db.teacher.create({ data: { name: "Guru", email: "backup@example.test" } });
    const source = await createMaterialService(storage.db).create(owner.id, { title: "Organ", text: "Paru-paru merupakan organ pernapasan." }, randomUUID());
    const key = { materialId: source.id, revision: source.revision };
    for (const feature of ["reading", "slides"]) {
      const lesson = feature === "reading" ? "materialReading" : "materialSlideDeck";
      const images = feature === "reading" ? "materialReadingIllustration" : "materialSlideIllustration";
      const index = feature === "reading" ? "sectionIndex" : "slideIndex";
      await storage.db[lesson].create({ data: { ...key, content: {}, zImageRequests: 13 } });
      const reservation = { ...key, [index]: 0, leaseId: randomUUID() };
      await storage.db[images].create({ data: { ...reservation, leaseUntil: new Date(Date.now() + 60_000) } });
      const calls = [];
      const generate = budgetedImageGenerator(storage.db, feature, reservation, "cloudflare", async (prompt, task) => {
        calls.push(task.provider);
        if (task.provider === "cloudflare") throw Object.assign(new Error("Daily quota"), { code: "ILLUSTRATION_QUOTA_EXHAUSTED" });
        return png;
      });
      assert.deepEqual(await generate("Lungs"), png);
      assert.deepEqual(calls, ["cloudflare", "z-image"]);
      assert.equal((await storage.db[lesson].findFirst({ where: key })).zImageRequests, 13);
      assert.equal((await storage.db[images].findFirst({ where: key })).imageProvider, "z-image");
      await generate(null, { taskId: "already-submitted-task" });
      assert.deepEqual(calls, ["cloudflare", "z-image", "z-image"]);
      assert.equal((await storage.db[lesson].findFirst({ where: key })).zImageRequests, 13);
      await assert.rejects(budgetedImageGenerator(storage.db, feature, reservation, "cloudflare", async () => {
        throw Object.assign(new Error("Offline"), { code: "ILLUSTRATION_UNAVAILABLE" });
      })("Lungs"), { code: "ILLUSTRATION_UNAVAILABLE" });
    }
  } finally { await storage.close(); }
});
