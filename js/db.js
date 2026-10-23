// Armazenamento local (IndexedDB): relatórios + configurações.
const DB = (() => {
  const NAME = 'relatoriotec';
  const VERSION = 1;
  let dbPromise;

  function open() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(NAME, VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('reports')) db.createObjectStore('reports', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }

  async function run(store, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const out = fn(tx.objectStore(store));
      tx.oncomplete = () => resolve(out instanceof IDBRequest ? out.result : out);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  return {
    allReports: () => run('reports', 'readonly', s => s.getAll()),
    getReport: id => run('reports', 'readonly', s => s.get(id)),
    putReport: r => run('reports', 'readwrite', s => s.put(r)),
    deleteReport: id => run('reports', 'readwrite', s => s.delete(id)),
    get: key => run('kv', 'readonly', s => s.get(key)),
    set: (key, value) => run('kv', 'readwrite', s => s.put(value, key)),

    // Numeração sequencial por ano: RT-2026-0001
    async nextNumber() {
      const year = new Date().getFullYear();
      const seq = (await this.get('seq')) || {};
      seq[year] = (seq[year] || 0) + 1;
      await this.set('seq', seq);
      return `RT-${year}-${String(seq[year]).padStart(4, '0')}`;
    },
  };
})();
