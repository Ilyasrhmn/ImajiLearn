import { createId } from "./id.mjs";

export const emptyMediaJobs = Object.freeze([]);

export function createMediaJobStore() {
  let snapshot = emptyMediaJobs;
  const listeners = new Set(), tasks = new Map();
  function publish(next) { snapshot = next; listeners.forEach(listener => listener()); }
  function update(id, patch) {
    if (tasks.has(id)) publish(snapshot.map(job => job.id === id ? { ...job, ...patch } : job));
  }
  function clear() {
    const old = [...tasks.values()];
    tasks.clear();
    old.forEach(task => task.controller.abort());
    publish(emptyMediaJobs);
  }
  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot: () => snapshot,
    background: id => update(id, { foreground: false }),
    foreground: id => update(id, { foreground: true }),
    clear,
    remove(id) {
      if (snapshot.find(job => job.id === id)?.status === "running") return;
      tasks.delete(id);
      publish(snapshot.filter(job => job.id !== id));
    },
    start(meta, run) {
      if (snapshot.some(job => job.teacherId !== meta.teacherId)) clear();
      const key = JSON.stringify([meta.teacherId, meta.materialId, meta.revision, meta.feature]);
      const existing = snapshot.find(job => job.key === key && job.status === "running");
      if (existing) return tasks.get(existing.id).handle;
      snapshot.filter(job => job.key === key).forEach(job => tasks.delete(job.id));
      const id = createId(), controller = new AbortController();
      const handle = { id, signal: controller.signal, promise: null };
      tasks.set(id, { controller, handle });
      publish([...snapshot.filter(job => job.key !== key), { ...meta, key, id, foreground: true, status: "running", progress: null }]);
      handle.promise = Promise.resolve().then(() => {
        controller.signal.throwIfAborted();
        return run({ signal: controller.signal, onProgress: progress => update(id, { progress }) });
      }).then(data => {
        if (controller.signal.aborted) return { status: "cancelled" };
        update(id, { status: "ready" });
        return { status: "ready", data };
      }, error => {
        if (controller.signal.aborted) return { status: "cancelled" };
        update(id, { status: "failed", error: error.message || "Media belum berhasil dibuat. Buka draf untuk melanjutkan." });
        return { status: "failed", error };
      });
      return handle;
    },
  };
}

export const mediaJobs = createMediaJobStore();

export function mediaProgressTitle(action, progress) {
  if (progress?.waiting) return "Menunggu layanan AI";
  const count = Number.isFinite(progress?.completed) && Number.isFinite(progress?.total) && progress.total > 0
    ? ` ${progress.completed}/${progress.total}` : "";
  return `Membuat ${action}${count}`;
}
