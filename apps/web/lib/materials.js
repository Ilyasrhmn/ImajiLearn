const DB_NAME = "imajilearn-materials";

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("materials")) request.result.createObjectStore("materials", { keyPath: "id" });
      if (!request.result.objectStoreNames.contains("folders")) request.result.createObjectStore("folders", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Database terkunci"));
  });
}

async function transact(mode, operation) {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction("materials", mode);
      const request = operation(transaction.objectStore("materials"));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error("Penyimpanan dibatalkan"));
    });
  } finally { db.close(); }
}

export const listMaterials = () => transact("readonly", store => store.getAll());
export async function saveMaterial(material) {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(["materials", "folders"], "readwrite");
      const store = tx.objectStore("materials");
      if (material.folderId) {
        const folder = tx.objectStore("folders").get(material.folderId);
        folder.onsuccess = () => { if (folder.result) store.put(material); else tx.abort(); };
      } else store.put(material);
      tx.oncomplete = () => resolve(material);
      tx.onerror = tx.onabort = () => reject(tx.error || new Error("Folder tidak ditemukan"));
    });
  } finally { db.close(); }
}

export async function updateMaterial(id, changes) {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(["materials", "folders"], "readwrite");
      const store = transaction.objectStore("materials");
      const request = store.get(id);
      let updated;
      request.onsuccess = () => {
        if (!request.result || (request.result.archived && Object.hasOwn(changes, "selectedMedia"))) { transaction.abort(); return; }
        updated = { ...request.result, ...changes };
        if (changes.folderId) {
          const folder = transaction.objectStore("folders").get(changes.folderId);
          folder.onsuccess = () => { if (folder.result) store.put(updated); else transaction.abort(); };
        } else store.put(updated);
      };
      transaction.oncomplete = () => resolve(updated);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error("Materi tidak ditemukan"));
    });
  } finally { db.close(); }
}

export const deleteMaterial = id => transact("readwrite", store => store.delete(id));

export async function listFolders() {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("folders", "readonly");
      const request = tx.objectStore("folders").getAll();
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}

export async function changeFolder({ id, name, remove = false }) {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(["folders", "materials"], "readwrite");
      const store = tx.objectStore("folders");
      const all = store.getAll();
      const materials = tx.objectStore("materials").getAll();
      let error = "";
      let result;
      materials.onsuccess = () => {
        const folders = all.result;
        const existing = folders.find(folder => folder.id === id);
        if (remove) {
          if (!existing) error = "Folder tidak ditemukan.";
          else if (materials.result.some(item => item.folderId === id)) error = "Pindahkan materi dari folder ini terlebih dahulu, termasuk yang di arsip.";
          else store.delete(id);
        } else {
          const clean = name.trim().replace(/\s+/g, " ");
          if (!clean || clean.length > 80) error = "Isi nama mapel, maksimal 80 karakter.";
          else if (folders.some(folder => folder.id !== id && folder.name.toLocaleLowerCase("id") === clean.toLocaleLowerCase("id"))) error = "Nama mapel sudah ada.";
          else if (id && !existing) error = "Folder tidak ditemukan.";
          else if (!id && folders.length >= 40) error = "Maksimal 40 folder mapel.";
          else {
            result = { id: id || globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`, name: clean };
            store.put(result);
          }
        }
        if (error) tx.abort();
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = tx.onerror = () => reject(new Error(error || "Folder belum tersimpan. Coba lagi."));
    });
  } finally { db.close(); }
}
