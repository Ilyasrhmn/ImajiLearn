import test from "node:test";
import assert from "node:assert/strict";
import { createWorksheetRecord, applyWorksheetPatch, assertWorksheetVersion, detachWorksheetSource,
  toWorksheetDto, WorksheetVersionConflictError } from "./document.mjs";
import { WorksheetValidationError } from "./schema.mjs";

const initialTime = () => new Date("2026-11-08T01:00:00.000Z");
const laterTime = () => new Date("2026-11-08T01:01:00.000Z");
function input() {
  return {
    ownerId: "teacher-a", source: { id: "material-a", title: "Tumbuhan", revision: "server-revision-".repeat(8) },
    templateId: "sequence", grade: "4",
    content: {
      templateId: "sequence", title: "Pertumbuhan tumbuhan", instructions: ["Susun tahap pertumbuhan."],
      items: Array.from({ length: 4 }, (_, i) => ({ id: `card-${i}`, front: `Tahap ${i}`, back: "", assetId: null })),
      pairs: [], order: ["card-0", "card-1", "card-2", "card-3"], groups: [],
      teacher: { preparation: ["Siapkan gunting."], notes: "" },
    },
  };
}

test("record uses a UUID, independent schema/resource versions and server UTC dates", () => {
  const data = input(); const record = createWorksheetRecord(data, initialTime);
  assert.match(record.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(record.schemaVersion, 1); assert.equal(record.resourceVersion, 1);
  assert.equal(record.templateVersion, 1); assert.equal(record.assetVersion, 1);
  assert.equal(record.theme, "ink"); assert.equal(record.grade, "4");
  assert.equal(record.language, "id");
  assert.equal(record.createdAt, initialTime().toISOString()); assert.equal(record.updatedAt, record.createdAt);
  assert.notEqual(createWorksheetRecord(data, initialTime).id, record.id);
});

test("source snapshot is detached from core input and retains the full revision", () => {
  const data = input(); const original = structuredClone(data.source);
  const record = createWorksheetRecord(data, initialTime);
  data.source.title = "Updated source"; data.source.revision = "new"; data.grade = "6";
  data.content.items[0].front = "Changed input";
  assert.deepEqual(record.source, original);
  assert.equal(record.grade, "4"); assert.equal(record.content.items[0].front, "Tahap 0");
});

test("source deletion clears only the matching nullable relation and is repeatable", () => {
  const record = createWorksheetRecord(input(), initialTime);
  assert.deepEqual(detachWorksheetSource(record, "another-material"), record);
  const detached = detachWorksheetSource(record, "material-a");
  assert.equal(detached.sourceMaterialId, null);
  assert.deepEqual(detached.source, record.source);
  assert.deepEqual(detached.content, record.content);
  assert.deepEqual(detached.displayOrder, record.displayOrder);
  assert.equal(detached.cacheKey, record.cacheKey);
  assert.equal(record.sourceMaterialId, "material-a");
  assert.deepEqual(detachWorksheetSource(detached, "material-a"), detached);
  assert.equal(toWorksheetDto(detached).source.id, "material-a");
});

test("content/theme editing preserves identity, source, profile snapshot, cache and display order", () => {
  const record = createWorksheetRecord(input(), initialTime);
  const content = structuredClone(record.content); content.items[0].front = "Benih";
  const updated = applyWorksheetPatch(record, { content, theme: "color" }, 1, laterTime);
  assert.equal(updated.content.items[0].front, "Benih"); assert.equal(updated.theme, "color");
  assert.equal(updated.resourceVersion, 2); assert.equal(updated.schemaVersion, 1);
  assert.equal(updated.updatedAt, laterTime().toISOString());
  for (const key of ["id", "ownerId", "sourceMaterialId", "source", "templateId", "templateVersion",
    "assetVersion", "grade", "language", "cacheKey", "displayOrder", "createdAt"]) {
    assert.deepEqual(updated[key], record[key]);
  }
  content.items[0].front = "Changed patch";
  assert.equal(updated.content.items[0].front, "Benih"); assert.equal(record.content.items[0].front, "Tahap 0");
  updated.source.title = "Changed result";
  assert.equal(record.source.title, "Tumbuhan");
});

test("theme-only edits work after source deletion without reloading source or profile", () => {
  const record = detachWorksheetSource(createWorksheetRecord(input(), initialTime), "material-a");
  const updated = applyWorksheetPatch(record, { theme: "color" }, 1, laterTime);
  assert.equal(updated.sourceMaterialId, null); assert.deepEqual(updated.source, record.source);
  assert.deepEqual(updated.content, record.content); assert.equal(updated.grade, "4");
});

test("stale and missing versions are rejected without changing the record", () => {
  const record = createWorksheetRecord(input(), initialTime); const before = structuredClone(record);
  const updated = applyWorksheetPatch(record, { theme: "color" }, 1, laterTime);
  assert.throws(() => applyWorksheetPatch(updated, { theme: "ink" }, 1), WorksheetVersionConflictError);
  assert.throws(() => assertWorksheetVersion(record, 2), WorksheetVersionConflictError);
  for (const value of [undefined, null, "1", 0, -1, 1.5, NaN, Infinity]) {
    assert.throws(() => applyWorksheetPatch(record, { theme: "color" }, value), WorksheetValidationError);
  }
  assert.deepEqual(record, before);
});

test("editor cannot replace IDs, reorder cards or change capacity even when content schema is valid", () => {
  const record = createWorksheetRecord(input(), initialTime);
  const changedId = structuredClone(record.content);
  changedId.items[0].id = "replacement"; changedId.order[0] = "replacement";
  const reordered = structuredClone(record.content); reordered.items.reverse();
  const resized = structuredClone(record.content);
  for (const id of ["extra-a", "extra-b"]) {
    resized.items.push({ id, front: "Extra", back: "", assetId: null }); resized.order.push(id);
  }
  for (const content of [changedId, reordered, resized]) {
    assert.throws(() => applyWorksheetPatch(record, { content }, 1, laterTime), WorksheetValidationError);
  }
});

test("invalid edit and immutable-field injection leave stored data untouched", () => {
  const record = createWorksheetRecord(input(), initialTime); const before = structuredClone(record);
  for (const field of ["id", "ownerId", "source", "sourceMaterialId", "templateId", "templateVersion", "assetVersion",
    "grade", "cacheKey", "displayOrder", "schemaVersion", "resourceVersion", "createdAt", "updatedAt"]) {
    assert.throws(() => applyWorksheetPatch(record, { [field]: "injected" }, 1, laterTime), WorksheetValidationError);
  }
  const invalid = structuredClone(record.content); invalid.items[0].assetId = "https://example.com/a.svg";
  assert.throws(() => applyWorksheetPatch(record, { content: invalid }, 1, laterTime), WorksheetValidationError);
  assert.deepEqual(record, before);
});

test("DTO omits internal ownership and nullable relation and is an independent copy", () => {
  const record = createWorksheetRecord(input(), initialTime);
  record.internalMetadata = { private: true };
  const dto = toWorksheetDto(record);
  assert.equal(Object.hasOwn(dto, "ownerId"), false);
  assert.equal(Object.hasOwn(dto, "sourceMaterialId"), false);
  assert.equal(Object.hasOwn(dto, "internalMetadata"), false);
  assert.equal(Object.hasOwn(dto, "version"), false);
  dto.content.items[0].front = "Changed DTO"; dto.source.title = "Changed DTO"; dto.displayOrder.reverse();
  assert.equal(record.content.items[0].front, "Tahap 0"); assert.equal(record.source.title, "Tumbuhan");
});

test("record rejects invalid source metadata, grade and clock", () => {
  for (const field of ["id", "title", "revision"]) {
    const data = input(); data.source[field] = " ";
    assert.throws(() => createWorksheetRecord(data, initialTime), WorksheetValidationError);
  }
  for (const source of [null, undefined, {}]) {
    assert.throws(() => createWorksheetRecord({ ...input(), source }, initialTime), WorksheetValidationError);
  }
  for (const grade of [1, null, "0", "7", " 4 "]) {
    assert.throws(() => createWorksheetRecord({ ...input(), grade }, initialTime), WorksheetValidationError);
  }
  assert.equal(createWorksheetRecord({ ...input(), grade: "" }, initialTime).grade, "");
  assert.throws(() => createWorksheetRecord(input(), () => new Date("invalid")), TypeError);
  assert.throws(() => createWorksheetRecord(input(), () => "2026-11-08"), TypeError);
});

test("version overflow and a backwards clock fail without mutation", () => {
  const record = createWorksheetRecord(input(), initialTime);
  assert.throws(() => applyWorksheetPatch(record, { theme: "color" }, 1, () => new Date("2026-11-07")), RangeError);
  record.resourceVersion = Number.MAX_SAFE_INTEGER;
  assert.throws(() => applyWorksheetPatch(record, { theme: "color" }, record.resourceVersion, laterTime), RangeError);
  assert.equal(record.theme, "ink");
});
