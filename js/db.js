// IndexedDB storage. Everything the learner produces lives here, so it survives reloads and restarts.
// The same API is implemented in memory by createMemoryDb() (used by tests and as a fallback).

const NAME = "allenamento";
const VERSION = 2;     // 2: events store (XP, completed sessions)
export const STORES = {
  attempts: { keyPath: "id", autoIncrement: true, indexes: ["conceptId", "t"] },
  errors: { keyPath: "id", indexes: ["conceptId", "status", "errorType"] },
  progress: { keyPath: "conceptId" },
  skills: { keyPath: "skill" },
  vocab: { keyPath: "id", indexes: ["source"] },
  imports: { keyPath: "id" },
  achievements: { keyPath: "id" },
  settings: { keyPath: "key" },
  games: { keyPath: "id" },
  events: { keyPath: "id" }
};

function req(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }

export async function openDb() {
  if (!globalThis.indexedDB) return createMemoryDb();
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open(NAME, VERSION);
    r.onupgradeneeded = () => {
      const d = r.result;
      for (const [name, cfg] of Object.entries(STORES)) {
        if (d.objectStoreNames.contains(name)) continue;
        const s = d.createObjectStore(name, { keyPath: cfg.keyPath, autoIncrement: !!cfg.autoIncrement });
        (cfg.indexes || []).forEach(i => s.createIndex(i, i));
      }
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  // Ask the browser not to evict our data under storage pressure.
  try { await navigator.storage?.persist?.(); } catch { /* not supported */ }
  const tx = (store, mode = "readonly") => db.transaction(store, mode).objectStore(store);
  return {
    kind: "indexeddb",
    get: (s, k) => req(tx(s).get(k)),
    all: s => req(tx(s).getAll()),
    put: (s, v) => req(tx(s, "readwrite").put(v)),
    del: (s, k) => req(tx(s, "readwrite").delete(k)),
    clear: s => req(tx(s, "readwrite").clear()),
    async putMany(s, list) {
      const t = db.transaction(s, "readwrite");
      list.forEach(v => t.objectStore(s).put(v));
      await new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); });
    },
    byIndex: (s, index, value) => req(tx(s).index(index).getAll(value))
  };
}

export function createMemoryDb() {
  const data = Object.fromEntries(Object.keys(STORES).map(s => [s, new Map()]));
  let auto = 1;
  const keyOf = (s, v) => {
    const kp = STORES[s].keyPath;
    if (v[kp] == null && STORES[s].autoIncrement) v[kp] = auto++;
    return v[kp];
  };
  const clone = v => (v == null ? v : structuredClone(v));
  return {
    kind: "memory",
    async get(s, k) { return clone(data[s].get(k)); },
    async all(s) { return [...data[s].values()].map(clone); },
    async put(s, v) { v = clone(v); const k = keyOf(s, v); data[s].set(k, v); return k; },
    async del(s, k) { data[s].delete(k); },
    async clear(s) { data[s].clear(); },
    async putMany(s, list) { for (const v of list) await this.put(s, v); },
    async byIndex(s, index, value) { return [...data[s].values()].filter(v => v[index] === value).map(clone); }
  };
}

export async function exportAll(db) {
  const out = { app: "allenamento", version: VERSION, exportedAt: new Date().toISOString(), stores: {} };
  for (const s of Object.keys(STORES)) out.stores[s] = await db.all(s);
  return out;
}

export async function importAll(db, dump, { replace = false } = {}) {
  if (!dump || dump.app !== "allenamento" || !dump.stores) throw new Error("Not an Allenamento backup file.");
  for (const s of Object.keys(STORES)) {
    const rows = dump.stores[s];
    if (!Array.isArray(rows)) continue;
    if (replace) await db.clear(s);
    await db.putMany(s, rows);
  }
}
