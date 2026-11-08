import test from "node:test";
import assert from "node:assert/strict";
import { TEMPLATE_CAPACITIES, WorksheetValidationError, validateDisplayOrder, validateWorksheetContent, validateWorksheetPatch } from "./schema.mjs";
import { createWorksheetCacheKey, createWorksheetDisplayOrder } from "./identity.mjs";

function fixture(templateId = "fold", capacity = TEMPLATE_CAPACITIES[templateId][0]) {
  const items = Array.from({ length: capacity }, (_, i) => ({
    id: `card-${i}`, front: `Kartu ${i}`, back: "Penjelasan", assetId: null,
  }));
  return {
    templateId, title: "Bagian tumbuhan", instructions: ["Ikuti petunjuk guru."], items,
    pairs: templateId === "match" ? items.map(item => ({ itemId: item.id, target: "Jawaban" })) : [],
    order: templateId === "sequence" ? items.map(item => item.id) : [],
    groups: templateId === "group" ? Array.from({ length: capacity / 3 }, (_, i) => ({
      id: `group-${i}`, label: `Kelompok ${i}`, itemIds: items.slice(i * 3, i * 3 + 3).map(item => item.id),
    })) : [],
    teacher: { preparation: ["Siapkan kertas."], notes: "" },
  };
}
function rejects(content, templateId = content?.templateId ?? "fold") {
  assert.throws(() => validateWorksheetContent(content, templateId), WorksheetValidationError);
}

for (const [template, capacities] of Object.entries(TEMPLATE_CAPACITIES)) {
  for (const capacity of capacities) test(`${template}: accepts capacity ${capacity} and rejects adjacent invalid counts`, () => {
    const content = fixture(template, capacity);
    assert.deepEqual(validateWorksheetContent(content, template), content);
    for (const count of [capacity - 1, capacity + 1].filter(value => !capacities.includes(value))) {
      rejects(fixture(template, count));
    }
  });
}

const lengthCases = [
  ["title", 90, doc => doc, "title"],
  ["instruction", 140, doc => doc.instructions, 0],
  ["item id", 60, doc => doc.items[0], "id"],
  ["front", 64, doc => doc.items[0], "front"],
  ["back", 180, doc => doc.items[0], "back"],
  ["preparation", 160, doc => doc.teacher.preparation, 0],
  ["notes", 600, doc => doc.teacher, "notes"],
];
for (const [label, max, target, key] of lengthCases) test(`${label}: exact UTF-16 limit and limit + 1`, () => {
  const doc = fixture();
  target(doc)[key] = "a".repeat(max - 2) + "🌱";
  validateWorksheetContent(doc, "fold");
  target(doc)[key] += "a";
  rejects(doc);
});

test("required text rejects whitespace, nonstrings and empty text", () => {
  for (const value of ["", " \n ", null, 1, [], {}]) {
    const doc = fixture(); doc.title = value; rejects(doc);
  }
  const doc = fixture(); doc.items[0].front = ""; rejects(doc);
  doc.items[0].front = "A"; doc.items[0].back = ""; rejects(doc);
});

test("cube permits blank fronts; non-fold templates permit blank backs", () => {
  for (const template of Object.keys(TEMPLATE_CAPACITIES)) {
    const doc = fixture(template);
    doc.items[0].front = template === "cube" ? "" : "Kartu";
    doc.items[0].back = template === "fold" ? "Isi" : "";
    validateWorksheetContent(doc, template);
  }
});

test("instructions and preparation enforce array cardinality", () => {
  for (const [target, key, max] of [[doc => doc, "instructions", 3], [doc => doc.teacher, "preparation", 5]]) {
    for (const count of [0, max, max + 1]) {
      const doc = fixture(); target(doc)[key] = Array(count).fill("Petunjuk");
      if (count === max) validateWorksheetContent(doc, "fold"); else rejects(doc);
    }
  }
});

test("asset whitelist accepts only null or the five static asset IDs", () => {
  for (const value of [null, ...Array.from({ length: 5 }, (_, i) => `pancasila-${i + 1}`)]) {
    const doc = fixture(); doc.items[0].assetId = value; validateWorksheetContent(doc, "fold");
  }
  for (const value of [undefined, "pancasila-0", "pancasila-6", "https://example.com/image.svg", "__proto__", {}]) {
    const doc = fixture(); doc.items[0].assetId = value; rejects(doc);
  }
  const doc = fixture(); delete doc.items[0].assetId; rejects(doc);
});

test("rejects unknown or missing fields at every object boundary", () => {
  const cases = [["fold", doc => doc], ["fold", doc => doc.items[0]], ["fold", doc => doc.teacher],
    ["match", doc => doc.pairs[0]], ["group", doc => doc.groups[0]]];
  for (const [template, target] of cases) {
    const extra = fixture(template); target(extra).ownerId = "another-teacher"; rejects(extra);
    const missing = fixture(template); delete target(missing)[Object.keys(target(missing))[0]]; rejects(missing);
  }
});

test("rejects malformed JSON structures and mismatched templates with domain errors", () => {
  for (const value of [null, undefined, [], "text", 1, {}, { templateId: "fold" }]) rejects(value, "fold");
  rejects(fixture(), "unknown"); rejects(fixture(), "cube");
  const cyclic = fixture(); cyclic.self = cyclic; rejects(cyclic);
  const oversized = fixture(); oversized.title = "x".repeat(30_001); rejects(oversized);
  for (const [template, field] of [["match", "pairs"], ["group", "groups"]]) {
    const doc = fixture(template); doc[field][0] = null; rejects(doc);
  }
});

test("items, matching pairs and sequence order must cover unique IDs exactly once", () => {
  const duplicate = fixture(); duplicate.items[1].id = duplicate.items[0].id; rejects(duplicate);
  for (const template of ["match", "sequence"]) {
    for (const mode of ["duplicate", "missing", "foreign"]) {
      const doc = fixture(template);
      const key = template === "match" ? "pairs" : "order";
      if (mode === "missing") doc[key].pop();
      else if (template === "match") doc.pairs[0].itemId = mode === "duplicate" ? doc.items[1].id : "foreign";
      else doc.order[0] = mode === "duplicate" ? doc.items[1].id : "foreign";
      rejects(doc);
    }
  }
  for (const field of ["pairs", "order", "groups"]) {
    const doc = fixture(); doc[field] = ["unexpected"]; rejects(doc);
  }
});

test("matching target and group field limits", () => {
  for (const [template, target, key, max] of [
    ["match", doc => doc.pairs[0], "target", 110],
    ["group", doc => doc.groups[0], "id", 60],
    ["group", doc => doc.groups[0], "label", 48],
  ]) {
    const doc = fixture(template); target(doc)[key] = "a".repeat(max); validateWorksheetContent(doc, template);
    target(doc)[key] += "a"; rejects(doc);
    target(doc)[key] = " "; rejects(doc);
  }
});

test("group coverage, three cards per group and normalized unique labels", () => {
  const mutations = [
    doc => { doc.groups.pop(); },
    doc => { doc.groups[0].itemIds.pop(); },
    doc => { doc.groups[0].itemIds[0] = doc.groups[1].itemIds[0]; },
    doc => { doc.groups[0].id = doc.groups[1].id; },
    doc => { doc.groups[0].label = ` ${doc.groups[1].label.toUpperCase()} `; },
  ];
  for (const mutate of mutations) { const doc = fixture("group"); mutate(doc); rejects(doc); }
});

test("patch permits only content and theme, preserving caller data", () => {
  const content = fixture(); const patch = { content, theme: "color" };
  const result = validateWorksheetPatch(patch, "fold");
  result.content.items[0].front = "Diubah";
  assert.equal(content.items[0].front, "Kartu 0");
  assert.deepEqual(validateWorksheetPatch({ theme: "ink" }, "fold"), { theme: "ink" });
  for (const value of [null, [], {}, { theme: "dark" }, { source: {} }, { resourceVersion: 2 }, { content, ownerId: "other" }]) {
    assert.throws(() => validateWorksheetPatch(value, "fold"), WorksheetValidationError);
  }
});

test("display order preserves fixed templates and shuffles other templates without losing cards", () => {
  for (const template of Object.keys(TEMPLATE_CAPACITIES)) {
    const doc = fixture(template); const ids = doc.items.map(item => item.id);
    for (let i = 0; i < 20; i++) {
      const order = createWorksheetDisplayOrder(doc, template);
      validateDisplayOrder(order, ids);
      if (["fold", "cube"].includes(template)) assert.deepEqual(order, ids);
      else assert.notDeepEqual(order, ids);
    }
    assert.deepEqual(doc, fixture(template));
  }
  for (const invalid of [["a", "a"], ["a"], ["a", "c"], null]) {
    assert.throws(() => validateDisplayOrder(invalid, ["a", "b"]), WorksheetValidationError);
  }
});

test("cache key is stable and separates owners, source revisions, activities and grades", () => {
  const metadata = { ownerId: "teacher-a", sourceRevision: "server-revision-1", templateId: "fold", grade: "4" };
  const key = createWorksheetCacheKey(metadata);
  assert.match(key, /^[a-f0-9]{64}$/);
  assert.equal(key, createWorksheetCacheKey({ ...metadata }));
  for (const change of [{ ownerId: "teacher-b" }, { sourceRevision: "server-revision-2" }, { templateId: "cube" }, { grade: "" }]) {
    assert.notEqual(key, createWorksheetCacheKey({ ...metadata, ...change }));
  }
  for (const change of [{ ownerId: "" }, { sourceRevision: null }, { templateId: "unknown" }, { grade: 4 }, { grade: "7" }, { language: "en" }]) {
    assert.throws(() => createWorksheetCacheKey({ ...metadata, ...change }), WorksheetValidationError);
  }
});
