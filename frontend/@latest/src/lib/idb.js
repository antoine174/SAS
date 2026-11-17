// src/lib/idb.js
/**
 * App-side IndexedDB helper for the Share Target flow.
 *
 * The Service Worker writes the shared PDF here (key: 'latest-share').
 * The /quick-upload page reads it out for the user to review and upload.
 *
 * Both sides use the same DB name, version, and store to stay in sync.
 */

const DB_NAME = 'sas-share-store';
const DB_VERSION = 1;
const STORE_NAME = 'shared-files';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Retrieve the latest shared file from IndexedDB.
 * @returns {Promise<{ file: File, timestamp: number } | null>}
 */
export async function getSharedFile() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get('latest-share');
    req.onsuccess = () => {
      db.close();
      const record = req.result;
      if (!record) return resolve(null);
      const { name, type, buffer, timestamp } = record;
      const file = new File([buffer], name, { type: type || 'application/pdf' });
      resolve({ file, timestamp });
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

/**
 * Remove the shared file from IndexedDB after a successful upload.
 */
export async function clearSharedFile() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete('latest-share');
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
