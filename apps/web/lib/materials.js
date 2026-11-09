import { studioRequest } from "./studio-api.mjs";

const materialPath = id => `/materials/${encodeURIComponent(id)}`;
const folderPath = id => `/folders/${encodeURIComponent(id)}`;
const adapt = row => ({ ...row, createdAt: Date.parse(row.createdAt) });

export async function listMaterials(teacherId) {
  const items = [];
  let cursor;
  do {
    const query = new URLSearchParams({ view: "all", limit: "100" });
    if (cursor) query.set("cursor", cursor);
    const { data, page } = await studioRequest(teacherId, `/materials?${query}`);
    if (data.length) {
      const ids = data.map(item => item.id).join(",");
      const { data: preferences } = await studioRequest(teacherId, `/media-preferences?materialIds=${ids}`);
      const byId = new Map(preferences.map(preference => [preference.materialId, preference]));
      for (const row of data) {
        const { selectedMedia, songTemplateId, resourceVersion: preferenceVersion } = byId.get(row.id);
        items.push({ ...adapt(row), selectedMedia, songTemplateId, preferenceVersion });
      }
    }
    cursor = page.nextCursor;
  } while (cursor);
  return items;
}

export async function getMaterial(teacherId, id) {
  return adapt((await studioRequest(teacherId, materialPath(id))).data);
}

export function downloadMaterial(teacherId, id) {
  return studioRequest(teacherId, `${materialPath(id)}/file`, { binary: true });
}

export async function saveMaterial(teacherId, material, key) {
  const body = new FormData();
  body.set("title", material.title);
  body.set("text", material.text);
  if (material.folderId) body.set("folderId", material.folderId);
  if (material.file) body.set("file", material.file);
  return adapt((await studioRequest(teacherId, "/materials", { method: "POST", body, key })).data);
}

export async function updateMaterial(teacherId, material, changes) {
  if (Object.hasOwn(changes, "selectedMedia")) {
    const { data } = await studioRequest(teacherId, `/media-preferences/${encodeURIComponent(material.id)}`,
      { method: "PUT", body: changes, version: material.preferenceVersion ?? 0 });
    return { ...material, selectedMedia: data.selectedMedia, songTemplateId: data.songTemplateId, preferenceVersion: data.resourceVersion };
  }
  const body = Object.hasOwn(changes, "folderId") ? { ...changes, folderId: changes.folderId || null } : changes;
  const { data } = await studioRequest(teacherId, materialPath(material.id), { method: "PATCH", body, version: material.resourceVersion });
  return { ...material, ...adapt(data) };
}

export const deleteMaterial = (teacherId, material) =>
  studioRequest(teacherId, materialPath(material.id), { method: "DELETE", version: material.resourceVersion });

export async function listFolders(teacherId) {
  return (await studioRequest(teacherId, "/folders")).data;
}

export async function changeFolder(teacherId, { id, name, remove = false, resourceVersion, key }) {
  if (remove) return studioRequest(teacherId, folderPath(id), { method: "DELETE", version: resourceVersion });
  const { data } = await studioRequest(teacherId, id ? folderPath(id) : "/folders",
    { method: id ? "PATCH" : "POST", body: { name }, version: resourceVersion, key });
  return data;
}

import { teacherStorageKey } from "./teacher-storage.mjs";

const DB_NAME = "imajilearn-materials";

function openDatabase(teacherId) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(teacherStorageKey(teacherId, DB_NAME), 3);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("materials")) request.result.createObjectStore("materials", { keyPath: "id" });
      if (!request.result.objectStoreNames.contains("folders")) request.result.createObjectStore("folders", { keyPath: "id" });
      if (!request.result.objectStoreNames.contains("schedule")) request.result.createObjectStore("schedule", { keyPath: "key" });
    };
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Database terkunci"));
  });
}

export async function listSchedule(teacherId) {
  const db = await openDatabase(teacherId);
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("schedule", "readonly"), request = tx.objectStore("schedule").getAll();
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = tx.onabort = () => reject(tx.error || new Error("Jadwal tidak dapat dimuat."));
    });
  } finally { db.close(); }
}

export async function changeSchedule(teacherId, { year, semester, slot, newSubject = "", remove = false }) {
  const db = await openDatabase(teacherId);
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(["schedule", "folders"], "readwrite");
      const store = tx.objectStore("schedule"), folderStore = tx.objectStore("folders");
      const terms = store.getAll(), folderList = folderStore.getAll();
      let error = "", result, createdFolder;
      folderList.onsuccess = () => {
        const key = `${year}-${semester}`, all = terms.result, folders = folderList.result;
        const active = all.find(term => term.key === key), entries = active?.entries || [];
        if (!Number.isInteger(year) || year < 2000 || year > 2100 || !["1", "2"].includes(semester)) error = "Periksa tahun ajaran dan semester.";
        else if (remove) {
          if (!entries.some(item => item.id === slot.id)) error = "Jadwal tidak ditemukan.";
          else { result = { key, year, semester, entries: entries.filter(item => item.id !== slot.id) }; store.put(result); }
        } else {
          let folderId = slot.folderId;
          if (!folders.length && newSubject.trim()) {
            const name = newSubject.trim().replace(/\s+/g, " ");
            if (name.length > 80) error = "Nama mapel maksimal 80 karakter.";
            else { folderId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`; createdFolder = { id: folderId, name }; folderStore.put(createdFolder); }
          }
          const validTime = value => typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
          if (!error && (!slot.id || !slot.className.trim() || slot.className.length > 80 || !Number.isInteger(slot.day) || slot.day < 1 || slot.day > 6 || !validTime(slot.start) || !validTime(slot.end) || slot.start >= slot.end)) error = "Periksa kelas, hari, dan jam mulai–selesai.";
          else if (!error && !folders.some(item => item.id === folderId) && !(folders.length === 0 && newSubject.trim() && folderId)) error = "Pilih folder mapel yang tersedia.";
          else if (!error && entries.some(item => item.id !== slot.id && item.day === slot.day && slot.start < item.end && slot.end > item.start)) error = "Jam ini bertabrakan dengan jadwal mengajar lain.";
          else if (!error && !active && all.length >= 20) error = "Maksimal 20 semester tersimpan.";
          else if (!error && !entries.some(item => item.id === slot.id) && entries.length >= 100) error = "Maksimal 100 jam mengajar per semester.";
          if (!error) { result = { key, year, semester, entries: [...entries.filter(item => item.id !== slot.id), { ...slot, folderId, className: slot.className.trim() }] }; store.put(result); }
        }
        if (error) tx.abort();
      };
      tx.oncomplete = () => resolve({ term: result, createdFolder });
      tx.onerror = tx.onabort = () => reject(new Error(error || "Jadwal belum tersimpan. Coba lagi."));
    });
  } finally { db.close(); }
}
