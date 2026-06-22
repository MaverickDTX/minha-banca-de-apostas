// Tiny IndexedDB-backed cache for bookmaker logos.
// Persists Blobs so the app doesn't depend on Clearbit after first load.

const DB_NAME = "lovable-bet-cache";
const STORE = "logos";
const VERSION = 1;
const TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

type Entry = { blob: Blob; ts: number };

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function idbGet(key: string): Promise<Entry | undefined> {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result as Entry | undefined);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}

async function idbPut(key: string, value: Entry): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore quota / private mode
  }
}

const memUrl = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

/**
 * Returns an object URL for the logo at `remoteUrl`, fetching and persisting it
 * to IndexedDB on first access. Subsequent calls (even across reloads) read from
 * the local cache, so Clearbit is only contacted once per logo.
 * Returns `null` when the network fetch fails and no cached copy exists.
 */
export async function getCachedLogoUrl(key: string, remoteUrl: string): Promise<string | null> {
  const cachedUrl = memUrl.get(key);
  if (cachedUrl) return cachedUrl;

  const existing = inflight.get(key);
  if (existing) return existing;

  const task = (async () => {
    const hit = await idbGet(key);
    if (hit && Date.now() - hit.ts < TTL_MS) {
      const url = URL.createObjectURL(hit.blob);
      memUrl.set(key, url);
      return url;
    }
    try {
      const res = await fetch(remoteUrl, { mode: "cors" });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      if (!blob.type.startsWith("image/")) throw new Error("not-image");
      await idbPut(key, { blob, ts: Date.now() });
      const url = URL.createObjectURL(blob);
      memUrl.set(key, url);
      return url;
    } catch {
      if (hit) {
        const url = URL.createObjectURL(hit.blob);
        memUrl.set(key, url);
        return url;
      }
      return null;
    }
  })();

  inflight.set(key, task);
  try {
    return await task;
  } finally {
    inflight.delete(key);
  }
}