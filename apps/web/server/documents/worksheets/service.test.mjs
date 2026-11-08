import test from "node:test";
import assert from "node:assert/strict";
import { createWorksheetService } from "./service.mjs";
import { createWorksheetRecord, WorksheetVersionConflictError } from "./document.mjs";
import { WorksheetValidationError } from "./schema.mjs";

const now = () => new Date("2026-11-08T01:01:00.000Z");
const teacherA = { teacherId: "teacher-a" };
const teacherB = { teacherId: "teacher-b" };

function record(index = 0, ownerId = "teacher-a") {
  return createWorksheetRecord({
    ownerId, source: { id: `material-${index}`, title: "Bagian tumbuhan", revision: `revision-${index}` },
    templateId: "fold", grade: "4", content: {
      templateId: "fold", title: "Tumbuhan", instructions: ["Buka kartu."],
      items: Array.from({ length: 4 }, (_, i) => ({ id: `card-${i}`, front: `Bagian ${i}`, back: "Penjelasan", assetId: null })),
      pairs: [], order: [], groups: [], teacher: { preparation: ["Siapkan kertas."], notes: "" },
    },
  }, () => new Date("2026-11-08T01:00:00.000Z"));
}

function material(index = 0, ownerId = "teacher-a") {
  return { id: `material-${index}`, title: "Bagian tumbuhan", ownerId, revision: `revision-${index}`,
    extractionStatus: "ready", archived: false, text: "Materi tumbuhan." };
}

const command = (index = 0) => ({ materialId: `material-${index}`, templateId: "fold", content: record(index).content });

// Test double only: database locking and migrations require real-adapter tests.
function harness({ saved = [], materials = [], profiles = { "teacher-a": { grade: "4" }, "teacher-b": { grade: "4" } } } = {}) {
  let state = {
    saved: new Map(saved.map(item => [item.id, structuredClone(item)])),
    materials: new Map(materials.map(item => [`${item.ownerId}:${item.id}`, structuredClone(item)])),
    profiles: structuredClone(profiles),
  };
  let queue = Promise.resolve();
  const controls = { transactions: 0, failInsert: false, loseVersionRace: false, leak: null };
  const repository = {
    async withTeacherTransaction(ownerId, action) {
      const previous = queue;
      let release;
      queue = new Promise(resolve => { release = resolve; });
      await previous;
      controls.transactions++;
      const draft = structuredClone(state);
      const own = value => value?.ownerId === ownerId ? structuredClone(value) : null;
      const savedForOwner = () => [...draft.saved.values()].filter(item => item.ownerId === ownerId);
      const tx = {
        async getSaved(id) { return controls.leak ?? own(draft.saved.get(id)); },
        async listSaved({ limit, after }) {
          return savedForOwner().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
            .filter(item => !after || item.updatedAt < after.updatedAt || (item.updatedAt === after.updatedAt && item.id < after.id))
            .slice(0, limit).map(item => structuredClone(item));
        },
        async getSavedByCacheKey(key) { return savedForOwner().find(item => item.cacheKey === key) ?? null; },
        async countSaved() { return savedForOwner().length; },
        async replaceSaved(id, version, updated) {
          if (controls.loseVersionRace || !own(draft.saved.get(id)) || draft.saved.get(id).resourceVersion !== version) return false;
          draft.saved.set(id, structuredClone(updated)); return true;
        },
        async deleteSaved(id, version) {
          if (controls.loseVersionRace || !own(draft.saved.get(id)) || draft.saved.get(id).resourceVersion !== version) return false;
          return draft.saved.delete(id);
        },
        async getOwnedMaterial(id) { return draft.materials.get(`${ownerId}:${id}`) ?? null; },
        async getTeacherProfile() { return draft.profiles[ownerId] ?? null; },
        async insertSaved(document) {
          if (controls.failInsert) throw new Error("Synthetic insert failure");
          if (draft.saved.has(document.id) || savedForOwner().some(item => item.cacheKey === document.cacheKey)) throw new Error("Unique constraint");
          draft.saved.set(document.id, structuredClone(document));
        },
      };
      try { const result = await action(tx); state = draft; return result; }
      finally { release(); }
    },
  };
  const service = createWorksheetService({
    requireTeacher: async request => request?.teacherId ? { id: request.teacherId } : null,
    repository, clock: now,
  });
  return { service, controls, get state() { return structuredClone(state); } };
}

test("core auth and repository are required; unauthenticated calls never access storage", async () => {
  assert.throws(() => createWorksheetService({}), TypeError);
  const h = harness();
  for (const action of [() => h.service.list(null), () => h.service.get(null, "id"),
    () => h.service.update(null, "id", { theme: "color" }, 1), () => h.service.remove(null, "id", 1),
    () => h.service.storeDocument(null, command(), "revision-0")]) {
    await assert.rejects(action, { code: "UNAUTHENTICATED" });
  }
  assert.equal(h.controls.transactions, 0);
});

test("foreign saved documents are indistinguishable from missing resources", async () => {
  const document = record(); const h = harness({ saved: [document] });
  for (const id of [document.id, "missing"]) {
    await assert.rejects(() => h.service.get(teacherB, id), { code: "WORKSHEET_NOT_FOUND" });
    await assert.rejects(() => h.service.update(teacherB, id, { theme: "color" }, 1), { code: "WORKSHEET_NOT_FOUND" });
    await assert.rejects(() => h.service.remove(teacherB, id, 1), { code: "WORKSHEET_NOT_FOUND" });
  }
  assert.deepEqual(await h.service.list(teacherB), { data: [], page: { nextCursor: null } });
  assert.deepEqual(h.state.saved.get(document.id), document);
});

test("foreign records returned by a misconfigured repository are rejected", async () => {
  const h = harness(); h.controls.leak = record(0, "teacher-b");
  await assert.rejects(() => h.service.get(teacherA, "any-id"), { code: "WORKSHEET_NOT_FOUND" });
});

test("pagination orders updatedAt/id consistently and excludes other owners", async () => {
  const saved = [record(0), record(1), record(2), record(3, "teacher-b")];
  saved[0].updatedAt = "2026-11-08T01:00:30.000Z";
  const h = harness({ saved }); const first = await h.service.list(teacherA, { limit: 2 });
  assert.equal(first.data.length, 2); assert.equal(first.data[0].id, saved[0].id);
  const next = await h.service.list(teacherA, { limit: 2, cursor: first.page.nextCursor });
  assert.equal(next.data.length, 1); assert.equal(next.page.nextCursor, null);
  assert.equal(new Set([...first.data, ...next.data].map(item => item.id)).size, 3);
  assert.equal(Object.hasOwn(first.data[0], "ownerId"), false);
  for (const limit of [0, 101, "2", null, 1.5]) await assert.rejects(() => h.service.list(teacherA, { limit }), WorksheetValidationError);
  for (const cursor of ["", "!bad", 1, "a".repeat(513), Buffer.from('["not-date","id"]').toString("base64url"),
    Buffer.from('["2026-11-08T01:00:00.000Z","id","extra"]').toString("base64url")]) {
    await assert.rejects(() => h.service.list(teacherA, { cursor }), WorksheetValidationError);
  }
});

test("read/edit/delete preserve the snapshot after source deletion", async () => {
  const document = record(); document.sourceMaterialId = null;
  const h = harness({ saved: [document] });
  assert.deepEqual((await h.service.get(teacherA, document.id)).source, document.source);
  const updated = await h.service.update(teacherA, document.id, { theme: "color" }, 1);
  assert.equal(updated.resourceVersion, 2); assert.deepEqual(updated.source, document.source);
  await assert.rejects(() => h.service.remove(teacherA, document.id, 1), WorksheetVersionConflictError);
  assert.equal(await h.service.remove(teacherA, document.id, 2), undefined);
  await assert.rejects(() => h.service.get(teacherA, document.id), { code: "WORKSHEET_NOT_FOUND" });
});

test("concurrent edits permit one write for the same resource version", async () => {
  const document = record(); const h = harness({ saved: [document] });
  const results = await Promise.allSettled([h.service.update(teacherA, document.id, { theme: "color" }, 1),
    h.service.update(teacherA, document.id, { theme: "ink" }, 1)]);
  assert.equal(results.filter(item => item.status === "fulfilled").length, 1);
  assert.equal(results.find(item => item.status === "rejected").reason.code, "WORKSHEET_VERSION_CONFLICT");
  assert.equal(h.state.saved.get(document.id).resourceVersion, 2);
});

test("invalid edits and failed atomic comparisons leave the original data intact", async () => {
  const document = record(); const h = harness({ saved: [document] });
  await assert.rejects(() => h.service.update(teacherA, document.id, { ownerId: "teacher-b" }, 1), WorksheetValidationError);
  h.controls.loseVersionRace = true;
  await assert.rejects(() => h.service.update(teacherA, document.id, { theme: "color" }, 1), WorksheetVersionConflictError);
  await assert.rejects(() => h.service.remove(teacherA, document.id, 1), WorksheetVersionConflictError);
  assert.deepEqual(h.state.saved.get(document.id), document);
});

test("internal storage builds source/profile snapshots and document metadata on the server", async () => {
  const h = harness({ materials: [material()], profiles: { "teacher-a": { grade: "6" } } });
  const result = await h.service.storeDocument(teacherA, command(), "revision-0");
  assert.equal(result.grade, "6"); assert.equal(result.theme, "ink"); assert.equal(result.resourceVersion, 1);
  assert.deepEqual(result.source, { id: "material-0", title: "Bagian tumbuhan", revision: "revision-0" });
  assert.equal(h.state.saved.get(result.id).ownerId, "teacher-a");
  assert.equal(h.state.saved.get(result.id).sourceMaterialId, "material-0");
});

test("storage rejects foreign, deleted, archived, unreadable and changed sources", async () => {
  for (const change of [null, { ownerId: "teacher-b" }, { archived: true }, { archived: undefined },
    { extractionStatus: "pending" }, { text: " " }, { revision: "new-revision" }]) {
    const source = change === null ? null : { ...material(), ...change };
    const h = harness({ materials: source ? [source] : [] });
    await assert.rejects(() => h.service.storeDocument(teacherA, command(), "revision-0"), {
      code: !source || change.ownerId ? "MATERIAL_NOT_FOUND" : change.revision ? "SOURCE_CHANGED" : "SOURCE_NOT_READY",
    });
    assert.equal(h.state.saved.size, 0);
  }
});

test("storage rejects injected metadata, malformed content, and missing server revisions", async () => {
  const h = harness({ materials: [material()] });
  const invalidContent = command(); invalidContent.content.items[0].assetId = "https://example.com/asset.svg";
  for (const value of [null, {}, { ...command(), ownerId: "teacher-b" }, { ...command(), cacheKey: "client" }, invalidContent]) {
    await assert.rejects(() => h.service.storeDocument(teacherA, value, "revision-0"), WorksheetValidationError);
  }
  await assert.rejects(() => h.service.storeDocument(teacherA, command()), WorksheetValidationError);
  assert.equal(h.state.saved.size, 0);
});

test("cache hit preserves teacher edits even at the 20-document limit", async () => {
  const saved = Array.from({ length: 20 }, (_, i) => record(i));
  saved[0].theme = "color"; saved[0].content.items[0].front = "Edit guru"; saved[0].resourceVersion = 2;
  const h = harness({ saved, materials: [material()] });
  const result = await h.service.storeDocument(teacherA, command(), "revision-0");
  assert.equal(result.id, saved[0].id); assert.equal(result.theme, "color");
  assert.equal(result.content.items[0].front, "Edit guru"); assert.equal(result.resourceVersion, 2);
  assert.equal(h.state.saved.size, 20);
});

test("cache hit retains the once-shuffled display order on matching worksheets", async () => {
  const h = harness({ materials: [material()] }); const input = command();
  input.templateId = "match"; input.content.templateId = "match";
  input.content.pairs = input.content.items.map(item => ({ itemId: item.id, target: "Jawaban" }));
  const first = await h.service.storeDocument(teacherA, input, "revision-0");
  assert.notDeepEqual(first.displayOrder, first.content.items.map(item => item.id));
  const again = await h.service.storeDocument(teacherA, input, "revision-0");
  assert.equal(again.id, first.id); assert.deepEqual(again.displayOrder, first.displayOrder);
});

test("a changed profile grade affects only the new document snapshot and cache identity", async () => {
  const previous = record();
  const h = harness({ saved: [previous], materials: [material()], profiles: { "teacher-a": { grade: "6" } } });
  const next = await h.service.storeDocument(teacherA, command(), "revision-0");
  assert.equal(next.grade, "6"); assert.notEqual(next.id, previous.id); assert.notEqual(next.cacheKey, previous.cacheKey);
  assert.deepEqual(h.state.saved.get(previous.id), previous);
});

test("saved-document quota is per teacher and rejects document 21", async () => {
  const saved = Array.from({ length: 19 }, (_, i) => record(i));
  const h = harness({ saved: [...saved, ...Array.from({ length: 20 }, (_, i) => record(i, "teacher-b"))],
    materials: [material(20), material(21)] });
  await h.service.storeDocument(teacherA, command(20), "revision-20");
  await assert.rejects(() => h.service.storeDocument(teacherA, command(21), "revision-21"), { code: "WORKSHEET_LIMIT_REACHED" });
  assert.equal([...h.state.saved.values()].filter(item => item.ownerId === "teacher-a").length, 20);
});

test("simultaneous stores cannot exceed quota under the repository transaction contract", async () => {
  const h = harness({ saved: Array.from({ length: 19 }, (_, i) => record(i)), materials: [material(20), material(21)] });
  const results = await Promise.allSettled([20, 21].map(i => h.service.storeDocument(teacherA, command(i), `revision-${i}`)));
  assert.equal(results.filter(item => item.status === "fulfilled").length, 1);
  assert.equal(results.find(item => item.status === "rejected").reason.code, "WORKSHEET_LIMIT_REACHED");
  assert.equal(h.state.saved.size, 20);
});

test("concurrent storage of the same source/template reuses the saved document", async () => {
  const h = harness({ materials: [material()] });
  const results = await Promise.all(Array.from({ length: 3 }, () => h.service.storeDocument(teacherA, command(), "revision-0")));
  assert.equal(new Set(results.map(item => item.id)).size, 1); assert.equal(h.state.saved.size, 1);
});

test("deletion removes cache eligibility; only a new storage command recreates a document", async () => {
  const document = record(); const h = harness({ saved: [document], materials: [material()] });
  await h.service.remove(teacherA, document.id, 1);
  assert.deepEqual(await h.service.list(teacherA), { data: [], page: { nextCursor: null } });
  await assert.rejects(() => h.service.get(teacherA, document.id), { code: "WORKSHEET_NOT_FOUND" });
  const recreated = await h.service.storeDocument(teacherA, command(), "revision-0");
  assert.notEqual(recreated.id, document.id); assert.equal(h.state.saved.size, 1);
});

test("insert failure rolls back and leaves a subsequent explicit retry possible", async () => {
  const h = harness({ materials: [material()] }); h.controls.failInsert = true;
  await assert.rejects(() => h.service.storeDocument(teacherA, command(), "revision-0"), /Synthetic insert failure/);
  assert.equal(h.state.saved.size, 0); h.controls.failInsert = false;
  await h.service.storeDocument(teacherA, command(), "revision-0"); assert.equal(h.state.saved.size, 1);
});
