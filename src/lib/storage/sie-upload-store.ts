const DATABASE_NAME = "noxer-local-data";
const DATABASE_VERSION = 1;
const STORE_NAME = "sie4-uploads";

type StoredSieUpload = {
  id: string;
  name: string;
  type: string;
  lastModified: number;
  content: ArrayBuffer;
};

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB-begäran misslyckades"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB-transaktionen misslyckades"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB-transaktionen avbröts"));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof window === "undefined" || !window.indexedDB) {
    return Promise.reject(new Error("IndexedDB stöds inte i den här webbläsaren"));
  }

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    const timeout = window.setTimeout(() => {
      reject(new Error("IndexedDB svarade inte inom tidsgränsen"));
    }, 1500);
    const finish = <T>(callback: (value: T) => void, value: T) => {
      window.clearTimeout(timeout);
      callback(value);
    };

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => finish(resolve, request.result);
    request.onerror = () => finish(reject, request.error ?? new Error("Kunde inte öppna IndexedDB"));
    request.onblocked = () => finish(reject, new Error("IndexedDB blockeras av en annan anslutning"));
  });
}

function uploadId(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

export async function loadStoredSieUploads(): Promise<File[]> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const records = await requestResult<StoredSieUpload[]>(transaction.objectStore(STORE_NAME).getAll());
    return records.map(
      (record) => new File([record.content], record.name, {
        type: record.type || "application/octet-stream",
        lastModified: record.lastModified
      })
    );
  } finally {
    database.close();
  }
}

export async function replaceStoredSieUploads(files: File[]): Promise<void> {
  const records = await Promise.all(
    files.map(async (file): Promise<StoredSieUpload> => ({
      id: uploadId(file),
      name: file.name,
      type: file.type,
      lastModified: file.lastModified,
      content: await file.arrayBuffer()
    }))
  );
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    store.clear();
    for (const record of records) store.put(record);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function clearStoredSieUploads(): Promise<void> {
  await replaceStoredSieUploads([]);
}
