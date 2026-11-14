import assert from "node:assert/strict";
import { test } from "node:test";
import { createKieImage } from "../apps/web/server/ai/providers/kie-image.mjs";
import { resolveLessonIllustration, illustrationMime } from "../apps/web/server/materials/lesson-illustration.mjs";

const id = "a".repeat(32);
const png = Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.alloc(40)]);
const env = { KIE_API_KEY: "test-key" };
const success = () => Response.json({ code: 200, data: { taskId: id, state: "success", resultJson: JSON.stringify({ resultUrls: ["https://tempfile.aiquickdraw.com/image.png"] }) } });

test("Z-Image submits once, polls, downloads without forwarding credentials and preserves its task", async () => {
  const saved = [], calls = []; let polls = 0;
  const generate = createKieImage(env, async (url, options) => {
    calls.push(String(url));
    if (String(url).includes("createTask")) {
      assert.equal(saved[0], "submitting");
      assert.deepEqual(JSON.parse(options.body), { model: "z-image", input: { prompt: "A plant", aspect_ratio: "16:9" } });
      return Response.json({ code: 200, data: { taskId: id } });
    }
    if (String(url).includes("recordInfo")) return ++polls === 1 ? Response.json({ code: 200, data: { taskId: id, state: "waiting" } }) : success();
    assert.equal(options.headers, undefined); assert.equal(options.redirect, "error");
    return new Response(png);
  }, async () => {});
  assert.deepEqual(await generate("A plant", { onTask: async value => saved.push(value) }), png);
  assert.deepEqual(saved, ["submitting", id]);
  assert.equal(calls.filter(url => url.includes("createTask")).length, 1);
  assert.equal(illustrationMime(png), "image/png");
});

test("resumes a paid task after network failure without posting another generation", async () => {
  let saved, posts = 0, fail = true;
  const generate = createKieImage(env, async url => {
    if (String(url).includes("createTask")) { posts++; return Response.json({ code: 200, data: { taskId: id } }); }
    if (String(url).includes("recordInfo")) { if (fail) throw Error("offline"); return success(); }
    return new Response(png);
  });
  await assert.rejects(generate("A plant", { onTask: async value => { saved = value; } }), { code: "ILLUSTRATION_UNAVAILABLE" });
  assert.equal(saved, id); fail = false;
  assert.deepEqual(await generate(null, { taskId: saved }), png);
  assert.equal(posts, 1);
});

test("an ambiguous paid POST blocks automatic resubmission", async () => {
  let saved, calls = 0;
  const generate = createKieImage(env, async () => { calls++; throw Error("timeout"); });
  await assert.rejects(generate("A plant", { onTask: async value => { saved = value; } }), { code: "ILLUSTRATION_REQUEST_UNKNOWN" });
  await assert.rejects(generate(null, { taskId: saved }), { code: "ILLUSTRATION_REQUEST_UNKNOWN" });
  assert.equal(calls, 1);
});

test("quota and access errors are actionable and release the unsubmitted task", async () => {
  for (const [code, expected] of [[402, "ILLUSTRATION_QUOTA_EXHAUSTED"], [401, "ILLUSTRATION_ACCESS_DENIED"], [429, "ILLUSTRATION_RATE_LIMITED"]]) {
    const saved = [];
    await assert.rejects(createKieImage(env, async () => Response.json({ code }))("A plant", { onTask: async value => saved.push(value) }), { code: expected });
    assert.deepEqual(saved, ["submitting", null]);
  }
});

test("rejects overlong prompts before spending credits and blocks non-CDN downloads", async () => {
  await assert.rejects(createKieImage(env, async () => { throw Error("must not call"); })("x".repeat(1001)), { code: "INVALID_ILLUSTRATION_PLAN" });
  let calls = 0;
  await assert.rejects(createKieImage(env, async () => { calls++; return Response.json({ code: 200, data: { taskId: id, state: "success", resultJson: JSON.stringify({ resultUrls: ["http://127.0.0.1/private"] }) } }); })(null, { taskId: id }), { code: "INVALID_ILLUSTRATION" });
  assert.equal(calls, 1);
});

test("the lesson planner's maximum prompt fits Z-Image without discarding the main description", async () => {
  await resolveLessonIllustration({}, async () => ({ content: { generate: true, figureId: null, subject: "s".repeat(140), composition: "c".repeat(360), details: "d".repeat(280) } }), async prompt => {
    assert.ok(prompt.length <= 1000, String(prompt.length)); assert.ok(prompt.includes("d".repeat(280))); return png;
  }, { userId: "owner", source: { text: "", title: "A plant" }, title: "A plant", lines: [], sourceFigures: [] });
});

test("reading and slides enforce unlabeled scene prompts and reject requests for written labels before charging", async () => {
  for (const feature of ["reading", "slides"]) {
    const options = { feature, userId: "owner", source: { text: "Hidung menyaring debu.", title: "Hidung" }, title: "Hidung", lines: ["Hidung menyaring debu."], sourceFigures: [] };
    let imageCalls = 0;
    const generate = async prompt => {
      imageCalls++;
      assert.ok(prompt.startsWith("UNLABELED IMAGE."));
      assert.match(prompt, /No title, poster layout, callout lines/);
      assert.ok(!prompt.includes("textbook illustration"));
      return png;
    };
    const plan = { figureId: null, generate: true, subject: "Nose filtering dust", composition: "Side cutaway of nasal cavity", details: "Dust caught in nasal hairs" };
    await resolveLessonIllustration({}, async () => ({ content: plan }), generate, options);
    await assert.rejects(resolveLessonIllustration({}, async () => ({ content: { ...plan, composition: "Side cutaway with labels and a legend" } }), generate, options), { code: "INVALID_ILLUSTRATION_PLAN" });
    for (const composition of ["An inset of a liver with arrows from a vessel", "Pipa dengan cincin berbentuk huruf C", "x".repeat(361)]) {
      await assert.rejects(resolveLessonIllustration({}, async () => ({ content: { ...plan, composition } }), generate, options), { code: "INVALID_ILLUSTRATION_PLAN" });
    }
    assert.equal(imageCalls, 1);
  }
});

test("an organ heading with a subtitle and equivalent spelling reuses the correct PDF figure", async () => {
  const figure = { page: 4, caption: "Gambar 39. Tenggorokan (trachea)", bytes: png };
  for (const feature of ["reading", "slides"]) {
    const result = await resolveLessonIllustration({}, () => assert.fail("An exact organ figure does not need a generated plan"), () => assert.fail("Do not spend image credits"), {
      feature, userId: "owner", source: { title: "Organ Pernapasan", text: "Trakea memiliki cincin tulang rawan." },
      title: "Trakea: Pipa dengan Cincin Tulang Rawan", lines: ["Trakea memiliki cincin tulang rawan."],
      sourceFigures: [{ page: 3, caption: "Gambar 38. Faring", bytes: Buffer.alloc(40) }, figure],
    });
    assert.equal(result.sourcePage, 4);
    assert.deepEqual(result.bytes, png);
  }
});


test("reading and slide services persist provider tasks across retries and enforce ownership", async () => {
  const { testDatabase } = await import("./support/database.mjs");
  const { createMaterialService } = await import("../apps/web/server/materials/service.mjs");
  const { createReadingIllustration } = await import("../apps/web/server/materials/reading-illustration.mjs");
  const { createSlideIllustrations } = await import("../apps/web/server/materials/slide-illustrations.mjs");
  const { randomUUID } = await import("node:crypto");
  const storage = await testDatabase();
  try {
    for (const migration of storage.migrations) await storage.migrate(migration);
    const owner = await storage.db.teacher.create({ data: { name: "owner", email: "owner@example.test" } });
    const other = await storage.db.teacher.create({ data: { name: "other", email: "other@example.test" } });
    const source = await createMaterialService(storage.db).create(owner.id, { title: "Plant", text: "Roots absorb water." }, randomUUID());
    const key = { materialId: source.id, revision: source.revision };
    await storage.db.materialReading.create({ data: { ...key, content: { sections: [{ heading: "Roots", paragraphs: ["Roots absorb water."] }] } } });
    await storage.db.materialSlideDeck.create({ data: { ...key, content: { slides: [{ title: "Roots", points: ["Roots absorb water."] }] } } });
    for (const type of ["reading", "slides"]) {
      let posts = 0, failed = true, plans = 0;
      const generate = createKieImage(env, async url => {
        if (String(url).includes("createTask")) { posts++; return Response.json({ code: 200, data: { taskId: id } }); }
        if (String(url).includes("recordInfo")) { if (failed) throw Error("offline"); return success(); }
        return new Response(png);
      });
      const planner = async () => { plans++; return { content: { figureId: null, generate: true, subject: "Roots", composition: "Side view", details: "Absorb water" } }; };
      const service = type === "reading" ? createReadingIllustration(storage.db, generate, planner) : createSlideIllustrations(storage.db, generate, planner);
      const args = type === "reading" ? [source.id, false, 0, { sourceFigures: [] }] : [source.id, source.revision, 0, false, { sourceFigures: [] }];
      await assert.rejects(service.generate(other.id, ...args), { status: 404 });
      await assert.rejects(service.generate(owner.id, ...args), { code: "ILLUSTRATION_UNAVAILABLE" });
      const table = type === "reading" ? storage.db.materialReadingIllustration : storage.db.materialSlideIllustration;
      assert.equal((await table.findFirst({ where: key })).providerTaskId, id);
      failed = false;
      await service.generate(owner.id, ...args);
      const row = await table.findFirst({ where: key });
      assert.deepEqual(Buffer.from(row.bytes), png);
      assert.equal(row.providerTaskId, null);
      await service.generate(owner.id, ...args);
      assert.equal(posts, 1); assert.equal(plans, 1);
    }
  } finally { await storage.close(); }
});
