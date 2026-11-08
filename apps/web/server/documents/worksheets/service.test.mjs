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

function candidate(index = 0, ownerId = "teacher-a") {
  const document = record(index, ownerId);
  return { id: document.id, ownerId, record: document, layoutState: "accepted", layoutVersion: 1,
    expiresAt: "2026-11-08T01:15:00.000Z", resultId: null, reserved: true };
}

function material(document) {
  return { id: document.sourceMaterialId, ownerId: document.ownerId, revision: document.source.revision,
    extractionStatus: "ready", archived: false, text: "Materi tumbuhan." };
}

// Test double only. Serial transactions model the repository contract; these tests
// do not verify a production database's locks, constraints or migration behavior.
function harness({ saved = [], candidates = [], materials = candidates.map(item => material(item.record)) } = {}) {
  let state = {
    saved: new Map(saved.map(item => [item.id, structuredClone(item)])),
    candidates: new Map(candidates.map(item => [item.id, structuredClone(item)])),
    materials: new Map(materials.map(item => [`${item.ownerId}:${item.id}`, structuredClone(item)])),
  };
  let queue = Promise.resolve();
  const controls = { transactions: 0, failConsume: false, failInsert: false, loseVersionRace: false, leak: null };
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
        async getCandidate(id) { return own(draft.candidates.get(id)); },
        async getOwnedMaterial(id) { return draft.materials.get(`${ownerId}:${id}`) ?? null; },
        async countOtherReservations(excludeId) {
          return [...draft.candidates.values()].filter(item => item.ownerId === ownerId && item.id !== excludeId &&
            item.reserved && !item.resultId && Date.parse(item.expiresAt) > now().getTime()).length;
        },
        async insertSaved(document) {
          if (controls.failInsert) throw new Error("Synthetic insert failure");
          if (draft.saved.has(document.id) || savedForOwner().some(item => item.cacheKey === document.cacheKey)) throw new Error("Unique constraint");
          draft.saved.set(document.id, structuredClone(document));
        },
        async consumeCandidate(id, resultId) {
          if (controls.failConsume) throw new Error("Synthetic candidate consumption failure");
          const item = draft.candidates.get(id); item.resultId = resultId; item.reserved = false;
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

test("service requires core auth and repository dependencies; unauthenticated calls never access storage", async () => {
  assert.throws(() => createWorksheetService({}), TypeError);
  const h = harness();
  for (const action of [() => h.service.list(null), () => h.service.get(null, "id"),
    () => h.service.update(null, "id", { theme: "color" }, 1), () => h.service.remove(null, "id", 1),
    () => h.service.publishApprovedCandidate(null, "id", 1)]) {
    await assert.rejects(action, { code: "UNAUTHENTICATED" });
  }
  assert.equal(h.controls.transactions, 0);
});

test("foreign documents and candidates are indistinguishable from missing resources", async () => {
  const document = record(); const pending = candidate(1);
  const h = harness({ saved: [document], candidates: [pending] });
  for (const id of [document.id, "missing"]) {
    await assert.rejects(() => h.service.get(teacherB, id), { code: "WORKSHEET_NOT_FOUND" });
    await assert.rejects(() => h.service.update(teacherB, id, { theme: "color" }, 1), { code: "WORKSHEET_NOT_FOUND" });
    await assert.rejects(() => h.service.remove(teacherB, id, 1), { code: "WORKSHEET_NOT_FOUND" });
  }
  await assert.rejects(() => h.service.publishApprovedCandidate(teacherB, pending.id, 1), { code: "WORKSHEET_NOT_FOUND" });
  assert.deepEqual(await h.service.list(teacherB), { data: [], page: { nextCursor: null } });
  assert.deepEqual(h.state.saved.get(document.id), document);
});

test("service rejects a foreign record even if a misconfigured repository returns it", async () => {
  const h = harness(); h.controls.leak = record(0, "teacher-b");
  await assert.rejects(() => h.service.get(teacherA, "any-id"), { code: "WORKSHEET_NOT_FOUND" });
});

test("pagination uses updatedAt/id ordering and excludes candidates and other owners", async () => {
  const saved = [record(0), record(1), record(2), record(3, "teacher-b")];
  saved[0].updatedAt = "2026-11-08T01:00:30.000Z";
  const h = harness({ saved, candidates: [candidate(10)] });
  const first = await h.service.list(teacherA, { limit: 2 });
  assert.equal(first.data.length, 2); assert.equal(first.data[0].id, saved[0].id);
  assert.equal(typeof first.page.nextCursor, "string");
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

test("read/edit/delete remain available after source deletion and preserve document snapshot", async () => {
  const document = record(); document.sourceMaterialId = null;
  const h = harness({ saved: [document], materials: [] });
  assert.deepEqual((await h.service.get(teacherA, document.id)).source, document.source);
  const updated = await h.service.update(teacherA, document.id, { theme: "color" }, 1);
  assert.equal(updated.resourceVersion, 2); assert.deepEqual(updated.source, document.source);
  await assert.rejects(() => h.service.remove(teacherA, document.id, 1), WorksheetVersionConflictError);
  assert.equal(h.state.saved.size, 1);
  assert.equal(await h.service.remove(teacherA, document.id, 2), undefined);
  await assert.rejects(() => h.service.get(teacherA, document.id), { code: "WORKSHEET_NOT_FOUND" });
});

test("concurrent edits with one version permit exactly one save", async () => {
  const document = record(); const h = harness({ saved: [document] });
  const outcomes = await Promise.allSettled([
    h.service.update(teacherA, document.id, { theme: "color" }, 1),
    h.service.update(teacherA, document.id, { theme: "ink" }, 1),
  ]);
  assert.equal(outcomes.filter(item => item.status === "fulfilled").length, 1);
  assert.equal(outcomes.find(item => item.status === "rejected").reason.code, "WORKSHEET_VERSION_CONFLICT");
  assert.equal(h.state.saved.get(document.id).resourceVersion, 2);
});

test("failed compare-and-swap or invalid body cannot overwrite or delete data", async () => {
  const document = record(); const h = harness({ saved: [document] });
  await assert.rejects(() => h.service.update(teacherA, document.id, { ownerId: "teacher-b" }, 1), WorksheetValidationError);
  h.controls.loseVersionRace = true;
  await assert.rejects(() => h.service.update(teacherA, document.id, { theme: "color" }, 1), WorksheetVersionConflictError);
  await assert.rejects(() => h.service.remove(teacherA, document.id, 1), WorksheetVersionConflictError);
  assert.deepEqual(h.state.saved.get(document.id), document);
});

test("publication consumes an approved candidate and is repeatable without duplicating it", async () => {
  const pending = candidate(); const h = harness({ candidates: [pending] });
  const saved = await h.service.publishApprovedCandidate(teacherA, pending.id, 1);
  assert.equal(saved.id, pending.record.id); assert.equal(h.state.saved.size, 1);
  assert.equal(h.state.candidates.get(pending.id).reserved, false);
  assert.deepEqual(await h.service.publishApprovedCandidate(teacherA, pending.id, 1), saved);
  await h.service.update(teacherA, saved.id, { theme: "color" }, 1);
  assert.equal((await h.service.publishApprovedCandidate(teacherA, pending.id, 1)).theme, "color");
  await h.service.remove(teacherA, saved.id, 2);
  await assert.rejects(() => h.service.publishApprovedCandidate(teacherA, pending.id, 1), { code: "WORKSHEET_NOT_FOUND" });
  assert.equal(h.state.saved.size, 0);
});

test("unapproved, rejected, stale-layout and expired candidates never enter the library", async () => {
  for (const change of [{ layoutState: "pending_layout" }, { layoutState: "rejected" }, { layoutState: "expired" },
    { layoutVersion: 2 }, { expiresAt: now().toISOString() }]) {
    const pending = { ...candidate(), ...change }; const h = harness({ candidates: [pending] });
    await assert.rejects(() => h.service.publishApprovedCandidate(teacherA, pending.id, 1),
      { code: change.expiresAt ? "WORKSHEET_CANDIDATE_EXPIRED" : "WORKSHEET_LAYOUT_REQUIRED" });
    assert.equal(h.state.saved.size, 0); assert.equal(h.state.candidates.get(pending.id).resultId, null);
  }
  const pending = candidate(); const h = harness({ candidates: [pending] });
  await assert.rejects(() => h.service.publishApprovedCandidate(teacherA, pending.id, 2), WorksheetVersionConflictError);
});

test("publication rechecks source existence, ownership, archive, readiness and revision", async () => {
  for (const change of [null, { ownerId: "teacher-b" }, { archived: true }, { archived: undefined }, { extractionStatus: "processing" },
    { text: " " }, { revision: "new-revision" }]) {
    const pending = candidate(); const source = change === null ? null : { ...material(pending.record), ...change };
    const h = harness({ candidates: [pending], materials: source ? [source] : [] });
    await assert.rejects(() => h.service.publishApprovedCandidate(teacherA, pending.id, 1), {
      code: !source || change.ownerId ? "MATERIAL_NOT_FOUND" : change.revision ? "SOURCE_CHANGED" : "SOURCE_NOT_READY",
    });
    assert.equal(h.state.saved.size, 0);
  }
});

test("server candidate schema, display order and authoritative cache key are revalidated", async () => {
  for (const mutate of [item => { item.record.content.title = ""; }, item => { item.record.displayOrder = []; },
    item => { item.record.cacheKey = "client-controlled"; }, item => { item.record.schemaVersion = 2; },
    item => { item.record.templateVersion = 2; }, item => { item.record.assetVersion = 2; },
    item => { item.record.language = "en"; }, item => { item.record.theme = "dark"; }]) {
    const pending = candidate(); mutate(pending); const h = harness({ candidates: [pending] });
    await assert.rejects(() => h.service.publishApprovedCandidate(teacherA, pending.id, 1), WorksheetValidationError);
    assert.equal(h.state.saved.size, 0);
  }
});

test("cache hit at full quota returns teacher edits and releases the extra reservation", async () => {
  const saved = Array.from({ length: 20 }, (_, i) => record(i));
  saved[0].theme = "color"; saved[0].content.items[0].front = "Edit guru"; saved[0].resourceVersion = 2;
  const pending = candidate(0); const h = harness({ saved, candidates: [pending] });
  const result = await h.service.publishApprovedCandidate(teacherA, pending.id, 1);
  assert.equal(result.id, saved[0].id); assert.equal(result.theme, "color");
  assert.equal(result.content.items[0].front, "Edit guru"); assert.equal(result.resourceVersion, 2);
  assert.equal(h.state.saved.size, 20); assert.equal(h.state.candidates.get(pending.id).reserved, false);
});

test("quota counts saved documents plus other live reservations, scoped per teacher", async () => {
  const saved = Array.from({ length: 19 }, (_, i) => record(i));
  const pending = candidate(20); const other = candidate(21);
  const h = harness({ saved, candidates: [pending, other] });
  await assert.rejects(() => h.service.publishApprovedCandidate(teacherA, pending.id, 1), { code: "WORKSHEET_LIMIT_REACHED" });
  assert.equal(h.state.saved.size, 19);
  const allowed = harness({ saved: [...saved, ...Array.from({ length: 20 }, (_, i) => record(i, "teacher-b"))],
    candidates: [pending, candidate(21, "teacher-b"), { ...other, expiresAt: now().toISOString() }] });
  await allowed.service.publishApprovedCandidate(teacherA, pending.id, 1);
  assert.equal([...allowed.state.saved.values()].filter(item => item.ownerId === "teacher-a").length, 20);
});

test("a new document at the 20-document limit is rejected without consuming its candidate", async () => {
  const saved = Array.from({ length: 20 }, (_, i) => record(i)); const pending = candidate(20);
  const h = harness({ saved, candidates: [pending] });
  await assert.rejects(() => h.service.publishApprovedCandidate(teacherA, pending.id, 1), { code: "WORKSHEET_LIMIT_REACHED" });
  assert.equal(h.state.saved.size, 20); assert.equal(h.state.candidates.get(pending.id).resultId, null);
});

test("simultaneous publications cannot exceed 20 under the repository transaction contract", async () => {
  const saved = Array.from({ length: 19 }, (_, i) => record(i));
  const candidates = [candidate(20), candidate(21)].map(item => ({ ...item, reserved: false }));
  const h = harness({ saved, candidates });
  const outcomes = await Promise.allSettled(candidates.map(item => h.service.publishApprovedCandidate(teacherA, item.id, 1)));
  assert.equal(outcomes.filter(item => item.status === "fulfilled").length, 1);
  assert.equal(outcomes.find(item => item.status === "rejected").reason.code, "WORKSHEET_LIMIT_REACHED");
  assert.equal(h.state.saved.size, 20);
});

test("two valid reservations at 18 saved documents both convert to a total of 20", async () => {
  const saved = Array.from({ length: 18 }, (_, i) => record(i)); const candidates = [candidate(20), candidate(21)];
  const h = harness({ saved, candidates });
  await Promise.all(candidates.map(item => h.service.publishApprovedCandidate(teacherA, item.id, 1)));
  assert.equal(h.state.saved.size, 20);
  assert.equal([...h.state.candidates.values()].filter(item => item.reserved).length, 0);
});

test("concurrent retries of the same candidate reuse a single document", async () => {
  const pending = candidate(); const h = harness({ candidates: [pending] });
  const results = await Promise.all(Array.from({ length: 3 }, () => h.service.publishApprovedCandidate(teacherA, pending.id, 1)));
  assert.equal(new Set(results.map(item => item.id)).size, 1); assert.equal(h.state.saved.size, 1);
});

test("insert or candidate-consumption failure rolls back publication and leaves retry possible", async () => {
  for (const failure of ["failInsert", "failConsume"]) {
    const pending = candidate(); const h = harness({ candidates: [pending] }); h.controls[failure] = true;
    await assert.rejects(() => h.service.publishApprovedCandidate(teacherA, pending.id, 1), /Synthetic/);
    assert.equal(h.state.saved.size, 0); assert.equal(h.state.candidates.get(pending.id).resultId, null);
    assert.equal(h.state.candidates.get(pending.id).reserved, true);
    h.controls[failure] = false;
    await h.service.publishApprovedCandidate(teacherA, pending.id, 1);
    assert.equal(h.state.saved.size, 1);
  }
});
