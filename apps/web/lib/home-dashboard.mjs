import { teacherStorageKey } from "./teacher-storage.mjs";

const historyKey = teacherId => teacherStorageKey(teacherId, "imajilearn-recent-materials");

export function currentTerm(date) {
  return { year: String(date.getMonth() < 6 ? date.getFullYear() - 1 : date.getFullYear()), semester: date.getMonth() < 6 ? "2" : "1" };
}

export function todayLessons(entries, date) {
  return entries.filter(slot => slot.day === date.getDay()).sort((a, b) => a.start.localeCompare(b.start));
}

function readHistory(teacherId, storage) {
  try {
    const rows = JSON.parse((storage ?? globalThis.localStorage)?.getItem(historyKey(teacherId)) ?? "[]");
    return Array.isArray(rows) ? rows.filter(row => row && typeof row.id === "string" && row.id.length <= 100).slice(0, 20) : [];
  } catch { return []; }
}

export function recordMaterialOpen(teacherId, materialId, storage) {
  if (!teacherId || typeof materialId !== "string" || !materialId || materialId.length > 100) return;
  try {
    const entries = [{ id: materialId }, ...readHistory(teacherId, storage).filter(row => row.id !== materialId)].slice(0, 20);
    (storage ?? globalThis.localStorage)?.setItem(historyKey(teacherId), JSON.stringify(entries));
  } catch { /* Browser storage is optional; opening a lesson must still work. */ }
}

export function recentMaterials(teacherId, materials, storage) {
  const available = new Map(materials.filter(item => !item.archived && !item.parentId).map(item => [item.id, item]));
  return [...new Set(readHistory(teacherId, storage).map(row => row.id))].map(id => available.get(id)).filter(Boolean).slice(0, 4);
}
