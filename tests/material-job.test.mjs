import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { mediaJobs } from "../packages/shared/lib/media-jobs.mjs";
import { startMaterialJob } from "../apps/web/lib/material-job.mjs";

const source = { id: "source", revision: "v1", title: "Fotosintesis" };
const base = { teacherId: "teacher", source, libraryId: "source", href: "/slide?hasil=source", resumeHref: "/slide?materi=source" };
afterEach(() => mediaJobs.clear());

test("background slide generation preserves incremental progress and removes a draft only after a complete result", async t => {
  const requests = [];
  let submits = 0;
  t.mock.method(globalThis, "fetch", async (path, options) => {
    requests.push([path, options.method]);
    if (path.includes("media-preferences")) return Response.json({ data: [] });
    if (options.method === "DELETE") return new Response(null, { status: 204 });
    return Response.json({ data: ++submits === 1 ? { status: "preparing", completed: 1, total: 2 } : { slides: [{ title: "Daun", points: ["Daun menangkap cahaya."] }] } });
  });
  const task = startMaterialJob({ ...base, format: { id: "slides", label: "Slide", action: "slide" }, path: "/materials/source/slides", draftPath: "/media/slides/drafts" });
  mediaJobs.background(task.id);
  const outcome = await task.promise;
  assert.equal(outcome.status, "ready");
  assert.equal(outcome.data.revision, "v1");
  assert.equal(mediaJobs.getSnapshot()[0].progress.completed, 1);
  assert.equal(mediaJobs.getSnapshot()[0].foreground, false);
  assert.equal(submits, 2);
  assert.equal(requests.filter(([, method]) => method === "DELETE").length, 1);
});

test("incomplete output fails without deleting the saved draft", async t => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (path, options) => {
    requests.push(options.method);
    return Response.json({ data: path.includes("media-preferences") ? [] : { slides: [] } });
  });
  const task = startMaterialJob({ ...base, format: { id: "slides" }, path: "/materials/source/slides", draftPath: "/media/slides/drafts" });
  const outcome = await task.promise;
  assert.equal(outcome.status, "failed");
  assert.match(outcome.error.message, /belum lengkap/);
  assert.ok(!requests.includes("DELETE"));
});

test("resuming a pending song only polls the existing task and never submits another generation", async t => {
  t.mock.method(globalThis, "fetch", async (_path, options) => {
    assert.equal(options.method, "GET");
    return Response.json({ data: { status: "ready", versions: [{ id: "track" }] } });
  });
  const task = startMaterialJob({ ...base, format: { id: "song" }, path: "/materials/source/song", pollSong: true });
  assert.equal((await task.promise).status, "ready");
});

test("logout discards a late response without clearing drafts or restoring a completed notification", async t => {
  const pending = Promise.withResolvers();
  let calls = 0;
  t.mock.method(globalThis, "fetch", () => { calls++; return pending.promise; });
  const task = startMaterialJob({ ...base, format: { id: "slides" }, path: "/materials/source/slides", draftPath: "/media/slides/drafts" });
  await Promise.resolve();
  mediaJobs.clear();
  pending.resolve(Response.json({ data: { slides: [{ title: "Daun" }] } }));
  assert.equal((await task.promise).status, "cancelled");
  assert.equal(calls, 1);
  assert.deepEqual(mediaJobs.getSnapshot(), []);
});
