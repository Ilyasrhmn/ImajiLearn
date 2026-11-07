const DB_NAME = "imajilearn-materials";

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("materials", { keyPath: "id" });
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
export const saveMaterial = material => transact("readwrite", store => store.put(material));
