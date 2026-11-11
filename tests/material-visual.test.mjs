import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createMaterialVisual } from "../apps/web/server/materials/visual.mjs";
import { createMaterialService } from "../apps/web/server/materials/service.mjs";
import { AIError } from "../apps/web/server/ai/errors.mjs";
import { resolveVisualModel } from "../apps/web/lib/visual-templates.mjs";
import { testDatabase } from "./support/database.mjs";

test("saved orbital flows keep their explanations and select the correct center", () => {
  const steps = [
    { label: "Paham Geosentris", detail: "Bumi berada di pusat model." },
    { label: "Transisi ke Heliosentris", detail: "Matahari menjadi pusat model." },
    { label: "Dukungan Ilmu Pengetahuan", detail: "Pengamatan mendukung perubahan tersebut." },
  ];
  const visual = resolveVisualModel({ kind: "flow", title: "Perkembangan Konsep Pusat Tata Surya", steps });
  assert.equal(visual.kind, "solar_system");
  assert.deepEqual(visual.orbitSteps.map(step => step.center), ["earth", "sun", "sun"]);
  assert.deepEqual(visual.orbitSteps.map(step => step.detail), steps.map(step => step.detail));
  assert.equal(resolveVisualModel({ kind: "flow", title: "Gerhana Bulan", steps: [
    { label: "Bumi", detail: "Bumi berada di antara Matahari dan Bulan." },
    { label: "Bayangan", detail: "Bulan masuk ke bayangan Bumi." },
  ] }), null);
  assert.equal(resolveVisualModel({ kind: "photosynthesis", title: "Fotosintesis", steps: [] }), null);
  assert.equal(resolveVisualModel({ kind: "main_idea", title: "Kalimat utama" }), null);
});

test("visual generation validates supported models and rejects diagrams without a model", async () => {
  const storage = await testDatabase();
  try {
    for (const migration of storage.migrations) await storage.migrate(migration);
    const [owner, other, invalidOwner] = await Promise.all(["owner", "other", "invalid"].map(name =>
      storage.db.teacher.create({ data: { name, email: name + "@example.test" } })));
    const materials = createMaterialService(storage.db);
    const earth = await materials.create(owner.id, {
      title: "Lapisan Bumi", text: "Kerak berada di permukaan. Mantel berada di bawah kerak.",
    }, randomUUID());
    const flow = await materials.create(owner.id, {
      title: "Pertumbuhan", text: "Benih berkecambah, lalu tunas tumbuh.",
    }, randomUUID());
    const earthContent = {
      kind: "earth", title: "Lapisan Bumi", details: {
        crust: "Kerak berada di permukaan.", mantle: "Mantel ada di bawah kerak.", outer_core: null, inner_core: null,
      },
    };
    const flowContent = {
      kind: "flow", title: "Pertumbuhan", layout: "sequence",
      steps: [{ label: "Benih", detail: "Benih berkecambah.", evidence: "Benih berkecambah" },
        { label: "Tunas", detail: "Tunas tumbuh.", evidence: "lalu tunas tumbuh." }],
    };
    const plantText = "Daun menangkap cahaya matahari. Akar menyerap air yang bergerak ke daun.";
    const plant = await materials.create(owner.id, { title: "Fotosintesis", text: plantText }, randomUUID());
    const plantContent = {
      kind: "photosynthesis", title: "Fotosintesis", steps: [
        { label: "Cahaya", detail: "Daun menangkap cahaya matahari.", evidence: "Daun menangkap cahaya matahari.", focus: "light" },
        { label: "Air", detail: "Air bergerak ke daun.", evidence: "Akar menyerap air yang bergerak ke daun.", focus: "water" },
      ],
    };
    const invalidPlant = { ...plantContent, steps: [{ ...plantContent.steps[0], focus: "unknown" }, plantContent.steps[1]] };
    await assert.rejects(createMaterialVisual(storage.db, async () => ({ content: invalidPlant })).generate(owner.id, plant.id), { code: "INVALID_VISUAL" });
    const unrelatedEvidence = { ...plantContent, steps: [{ ...plantContent.steps[0], evidence: plantContent.steps[1].evidence }, plantContent.steps[1]] };
    await assert.rejects(createMaterialVisual(storage.db, async () => ({ content: unrelatedEvidence })).generate(owner.id, plant.id), { code: "INVALID_VISUAL" });
    const invalidPlantSource = await materials.create(invalidOwner.id, { title: "Fotosintesis", text: plantText }, randomUUID());
    const duplicateFocus = { ...plantContent, steps: [plantContent.steps[0], { ...plantContent.steps[0], label: "Sinar" }] };
    await assert.rejects(createMaterialVisual(storage.db, async () => ({ content: duplicateFocus })).generate(invalidOwner.id, invalidPlantSource.id), { code: "INVALID_VISUAL" });
    assert.deepEqual(await createMaterialVisual(storage.db, async () => ({ content: plantContent })).generate(owner.id, plant.id), plantContent);
    const invalidFlowSource = await materials.create(invalidOwner.id, { title: "Pertumbuhan", text: "Benih berkecambah, lalu tunas tumbuh." }, randomUUID());
    const ungroundedFlow = { ...flowContent, steps: [flowContent.steps[0], { ...flowContent.steps[1], evidence: "Daun berubah warna." }] };
    await assert.rejects(createMaterialVisual(storage.db, async () => ({ content: ungroundedFlow })).generate(invalidOwner.id, invalidFlowSource.id), { code: "INVALID_VISUAL" });
    const assembly = {
      kind: "assembly", title: "Tuas sederhana", parts: [
        { id: "base", label: "Tumpuan", detail: "Tumpuan menyangga papan.", evidence: "Tumpuan menyangga papan.", shape: "wedge", at: [0, 0, 0], size: [32, 40, 30], tone: "clay", spread: [0, 0, 0] },
        { id: "board", label: "Papan", detail: "Papan berada di atas tumpuan.", evidence: "Papan berada di atas tumpuan.", shape: "slab", at: [0, 0, 30], size: [170, 40, 8], tone: "ochre", spread: [0, 0, 34] },
      ],
    };
    const lever = await materials.create(other.id, { title: assembly.title, text: assembly.parts.map(part => part.evidence).join(" ") }, randomUUID());
    const makeAssembly = content => createMaterialVisual(storage.db, async () => ({ content }));
    for (const invalid of [
      { ...assembly, parts: [assembly.parts[0], { ...assembly.parts[1], size: [170, 0, 8] }] },
      { ...assembly, parts: [assembly.parts[0], { ...assembly.parts[1], at: [0, 0, 0] }] },
      { ...assembly, parts: [assembly.parts[0], { ...assembly.parts[1], evidence: "Tambahkan bagian baru." }] },
    ]) await assert.rejects(makeAssembly(invalid).generate(other.id, lever.id), { code: "INVALID_VISUAL" });
    assert.deepEqual(await makeAssembly(assembly).generate(other.id, lever.id), assembly);
    await assert.rejects(makeAssembly({ ...assembly, parts: [] }).generate(other.id, lever.id, { regenerate: true }), { code: "INVALID_VISUAL" });
    assert.deepEqual(await makeAssembly().get(other.id, lever.id), assembly);
    const rebuilding = Promise.withResolvers(), replacement = Promise.withResolvers();
    const retry = createMaterialVisual(storage.db, async () => {
      rebuilding.resolve();
      return replacement.promise;
    });
    const regenerated = retry.generate(other.id, lever.id, { regenerate: true });
    const updatedAssembly = { ...assembly, title: "Bagian tuas sederhana" };
    try {
      await Promise.race([rebuilding.promise, regenerated]);
      assert.deepEqual(await retry.get(other.id, lever.id), assembly);
      await assert.rejects(retry.generate(other.id, lever.id, { regenerate: true }), { code: "VISUAL_IN_PROGRESS" });
      await assert.rejects(retry.generate(owner.id, lever.id, { regenerate: true }), { status: 404 });
    } finally {
      replacement.resolve({ content: updatedAssembly });
    }
    assert.deepEqual(await regenerated, updatedAssembly);
    assert.deepEqual(await retry.get(other.id, lever.id), updatedAssembly);
    const unavailable = createMaterialVisual(storage.db, async () => { throw new AIError("INVALID_PROVIDER_RESPONSE"); });
    const photosynthesisSource = "Daun menangkap cahaya matahari untuk fotosintesis. Air diserap akar dan dibawa melalui batang ke daun. Karbon dioksida masuk melalui stomata ke dalam daun.";
    const recovery = await materials.create(other.id, { title: "Fotosintesis", text: photosynthesisSource }, randomUUID());
    const recovered = await unavailable.generate(other.id, recovery.id);
    assert.deepEqual(recovered.steps.map(step => step.focus), ["light", "water", "carbon"]);
    assert.ok(recovered.steps.every(step => photosynthesisSource.includes(step.evidence)));
    await assert.rejects(unavailable.generate(other.id, lever.id, { regenerate: true }), { code: "INVALID_PROVIDER_RESPONSE" });
    for (const [content, sourceText] of [
      [{ kind: "cube_net", title: "Jaring-jaring kubus", evidence: "Enam persegi membentuk jaring-jaring kubus.", detail: "Enam persegi bertemu saat dilipat." }, "Enam persegi membentuk jaring-jaring kubus."],
    ]) {
      const material = await materials.create(owner.id, { title: content.title, text: sourceText }, randomUUID());
      const invalid = content.kind === "cube_net" ? { ...content, evidence: "Tidak ada di sumber." } : { ...content, sentences: content.sentences.toReversed() };
      await assert.rejects(createMaterialVisual(storage.db, async () => ({ content: invalid })).generate(owner.id, material.id), { code: "INVALID_VISUAL" });
      assert.deepEqual(await createMaterialVisual(storage.db, async () => ({ content })).generate(owner.id, material.id), content);
    }
    const started = Promise.withResolvers(), finish = Promise.withResolvers();
    let calls = 0;
    const visual = createMaterialVisual(storage.db, async (feature, { messages }) => {
      assert.equal(feature, "mindmap");
      calls++;
      if (JSON.parse(messages[1].content).title === "Pertumbuhan") return { content: flowContent };
      if (calls === 1) return { content: { ...earthContent, details: {} } };
      started.resolve();
      return finish.promise;
    });
    assert.equal(await visual.get(owner.id, earth.id), null);
    await assert.rejects(visual.get(other.id, earth.id), { status: 404 });
    await assert.rejects(visual.generate(other.id, earth.id), { status: 404 });
    await assert.rejects(visual.generate(owner.id, earth.id), { code: "INVALID_VISUAL" });
    const pending = visual.generate(owner.id, earth.id);
    try {
      await Promise.race([started.promise, pending]);
      await assert.rejects(visual.generate(owner.id, earth.id), { code: "VISUAL_IN_PROGRESS" });
    } finally { finish.resolve({ content: earthContent }); }
    assert.deepEqual(await pending, earthContent);
    assert.deepEqual(await visual.get(owner.id, earth.id), earthContent);
    assert.deepEqual(await visual.generate(owner.id, earth.id), earthContent);
    await assert.rejects(visual.generate(owner.id, flow.id), { code: "VISUAL_MODEL_UNSUPPORTED" });
    assert.equal(await visual.get(owner.id, flow.id), null);
    assert.equal(calls, 3);
    const clot = {
      kind: "flow", layout: "sequence", title: "Mekanisme Proses Pembekuan Darah",
      steps: [
        { label: "Trombosit", detail: "Trombosit menempel.", evidence: "Trombosit menempel." },
        { label: "Fibrin", detail: "Fibrin memperkuat sumbat.", evidence: "Fibrin memperkuat sumbat." },
      ],
    };
    const source = await materials.create(other.id, { title: clot.title, text: clot.steps.map(step => step.evidence).join(" ") }, randomUUID());
    const generated = await createMaterialVisual(storage.db, async () => ({ content: clot })).generate(other.id, source.id);
    assert.deepEqual(generated, resolveVisualModel(clot));
    assert.equal(generated.kind, "blood_clot");
    await storage.db.materialVisual.updateMany({ where: { materialId: source.id }, data: { content: clot } });
    const cachedVisual = createMaterialVisual(storage.db, () => assert.fail("A compatible saved result should be reused"));
    assert.deepEqual(await cachedVisual.get(other.id, source.id), generated);
    assert.deepEqual(await cachedVisual.generate(other.id, source.id), generated);
    await storage.db.materialVisual.updateMany({ where: { materialId: source.id }, data: { content: flowContent } });
    assert.equal(await cachedVisual.get(other.id, source.id), null);
    assert.deepEqual(await createMaterialVisual(storage.db, async () => ({ content: clot })).generate(other.id, source.id), generated);
  } finally { await storage.close(); }
});
