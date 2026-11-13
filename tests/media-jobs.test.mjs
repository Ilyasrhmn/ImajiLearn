import assert from "node:assert/strict";
import { test } from "node:test";
import { createMediaJobStore } from "../packages/shared/lib/media-jobs.mjs";

const meta = { teacherId: "teacher", materialId: "source", revision: "v1", feature: "slides", title: "Fotosintesis" };

test("minimizing and unsubscribing do not stop generation; duplicate requests reuse the same task", async () => {
  const store = createMediaJobStore(), pending = Promise.withResolvers();
  let calls = 0, progress;
  const unsubscribe = store.subscribe(() => {});
  const job = store.start(meta, async controls => { calls++; progress = controls.onProgress; return pending.promise; });
  await Promise.resolve();
  progress({ completed: 12, total: 32 });
  store.background(job.id);
  unsubscribe();
  assert.equal(job.signal.aborted, false);
  assert.equal(store.getSnapshot()[0].progress.completed, 12);
  assert.equal(store.getSnapshot()[0].foreground, false);
  assert.equal(store.start(meta, () => assert.fail("Duplicate paid submission")), job);
  assert.equal(calls, 1);
  pending.resolve({ slides: [{ title: "Daun" }] });
  assert.equal((await job.promise).status, "ready");
  assert.equal(store.getSnapshot()[0].status, "ready");
});

test("different sources run independently and failures stay visible until dismissed", async () => {
  const store = createMediaJobStore(), pending = Promise.withResolvers();
  const first = store.start(meta, () => pending.promise);
  const second = store.start({ ...meta, materialId: "other" }, async () => { throw new Error("Kredit habis"); });
  store.background(second.id);
  assert.equal((await second.promise).status, "failed");
  assert.equal(store.getSnapshot().find(job => job.id === second.id).error, "Kredit habis");
  store.remove(second.id);
  assert.equal(first.signal.aborted, false);
  pending.resolve({ slides: [] });
  await first.promise;
  assert.equal(store.getSnapshot().length, 1);
});

test("account changes abort previous tasks and late completions cannot restore private state", async () => {
  const store = createMediaJobStore(), pending = Promise.withResolvers();
  const first = store.start(meta, () => pending.promise);
  await Promise.resolve();
  const second = store.start({ ...meta, teacherId: "other-teacher" }, async () => ({ ready: true }));
  assert.equal(first.signal.aborted, true);
  pending.resolve({ privateContent: "old teacher" });
  assert.equal((await first.promise).status, "cancelled");
  await second.promise;
  assert.ok(store.getSnapshot().every(job => job.teacherId === "other-teacher"));
  store.clear();
  assert.deepEqual(store.getSnapshot(), []);
});

test("running jobs cannot be dismissed and clearing prevents further progress updates", async () => {
  const store = createMediaJobStore(), pending = Promise.withResolvers();
  let progress;
  const task = store.start(meta, async controls => { progress = controls.onProgress; return pending.promise; });
  await Promise.resolve();
  store.remove(task.id);
  assert.equal(store.getSnapshot().length, 1);
  store.clear();
  progress({ completed: 2, total: 3 });
  pending.resolve({ ready: true });
  await task.promise;
  assert.deepEqual(store.getSnapshot(), []);
});
