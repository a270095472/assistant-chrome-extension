// SOP-only IndexedDB repository. No notes/preferences keys or caller-provided
// transaction callbacks can enter this storage boundary.
export const SOP_DB = 'assistant-sop';
export function createSopRepository({ indexedDB = globalThis.indexedDB, name = SOP_DB } = {}) {
  async function open() {
    return new Promise((resolve, reject) => {
      let blocked = false;
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('state');
      request.onerror = () => reject(request.error);
      request.onblocked = () => { blocked = true; reject(new Error('database-blocked')); };
      request.onsuccess = () => { const db = request.result; if (blocked) { db.close(); return; }
        db.onversionchange = () => db.close(); resolve(db); };
    });
  }
  async function run(mode, work) {
    const db = await open();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('state', mode, mode === 'readwrite' ? { durability: 'strict' } : undefined);
        let value;
        tx.oncomplete = () => resolve(value);
        tx.onabort = () => reject(tx.error ?? new DOMException('Transaction aborted', 'AbortError'));
        tx.onerror = () => {}; // abort is the authoritative failure event
        work(tx.objectStore('state'), (result) => { value = result; });
      });
    } finally { db.close(); }
  }
  return {
    read: () => run('readonly', (store, done) => {
      const request = store.get('head'); request.onsuccess = () => done(request.result ?? null);
    }),
    // Exact raw-envelope CAS, not just a revision check. No await inside tx.
    commit: (expected, next) => run('readwrite', (store, done) => {
      const request = store.get('head');
      request.onsuccess = () => {
        if (JSON.stringify(request.result ?? null) !== JSON.stringify(expected)) { done(false); return; }
        store.put(next, 'head'); done(true);
      };
    }),
  };
}
