(function () {
  'use strict';
  const E = FruitLedger;
  let connection;
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('fruitledger-updates-v1') : null;
  function open() {
    if (connection) return Promise.resolve(connection);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('fruitledger-local-v1', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('ledger');
      req.onerror = () => reject(new Error('Local storage is unavailable. Open this app in a regular browser window with local storage enabled.'));
      req.onsuccess = () => { connection = req.result; connection.onversionchange = () => { connection.close(); connection = null; }; resolve(connection); };
    });
  }
  async function change(fn, notify = true) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('ledger', 'readwrite');
      const store = tx.objectStore('ledger');
      let result, error;
      const req = store.get('current');
      req.onsuccess = () => {
        try { result = fn(req.result); if (result !== req.result) store.put(result, 'current'); }
        catch (e) { error = e; tx.abort(); }
      };
      tx.oncomplete = () => { if (notify) channel?.postMessage('updated'); resolve(result); };
      tx.onabort = tx.onerror = () => reject(error || new Error('Your change could not be saved. Storage may be full or disabled. Nothing was recorded.'));
    });
  }
  async function read() {
    return change(existing => { if (existing) { E.replay(existing); return existing; } return E.demo(); }, false);
  }
  window.LedgerStore = {
    read,
    commit: (cmd, revision) => change(data => E.append(data, cmd, revision)),
    unit: unit => change(data => ({ ...data, unit })),
    replace: (replacement, revision) => change(data => {
      if (data.revision !== revision) throw new Error('The ledger changed in another tab. Review your data and try again.');
      E.replay(replacement);
      return { ...replacement, revision: data.revision + 1 };
    }),
    subscribe: listener => { if (channel) channel.onmessage = listener; }
  };
})();
