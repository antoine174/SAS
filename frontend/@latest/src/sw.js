/// <reference lib="webworker" />
/* eslint-env serviceworker */
/**
 * Custom Service Worker — injectManifest strategy.
 *
 * 1. Intercepts the Share Target POST from the OS share sheet,
 *    stores the shared PDF into IndexedDB, and redirects to /quick-upload.
 * 2. Precaches the app shell via Workbox.
 *
 * IMPORTANT: The share-target fetch listener is registered BEFORE
 * precacheAndRoute so it can respondWith() without interference.
 */

import { precacheAndRoute } from 'workbox-precaching';

// ─── Share Target Interception ───────────────────────────────────────────────
// The manifest declares action: '/quick-upload' (POST, multipart/form-data).
// Android posts the shared file here; we store it in IndexedDB then redirect.
// '/share-target' is kept as a fallback for previously-cached manifests.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Intercept POST to /quick-upload (the share_target action in the manifest).
  // The old path /share-target is also caught as a safety net for cached manifests.
  const isSharePost =
    event.request.method === 'POST' &&
    (url.pathname === '/quick-upload' || url.pathname === '/share-target');
  if (!isSharePost) return;

  event.respondWith(handleShareTarget(event.request));
});

/**
 * Extract the PDF from the multipart POST body, persist it in IndexedDB,
 * then redirect the user to /quick-upload.  The file is stored BEFORE any
 * auth check so if the user has to log in, the file is still waiting.
 */
async function handleShareTarget(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (file && file.size > 0) {
      const buffer = await file.arrayBuffer();
      const db = await idbOpen();
      const tx = db.transaction('shared-files', 'readwrite');
      tx.objectStore('shared-files').put({
        id: 'latest-share',
        name: file.name || 'shared.pdf',
        type: file.type || 'application/pdf',
        buffer,
        timestamp: Date.now(),
      });
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    }
  } catch (err) {
    console.error('[SW] Share target storage error:', err);
  }

  // Always redirect — even if storage failed, the page will show a fallback
  return Response.redirect('/quick-upload', 303);
}

// ─── Workbox Precaching ──────────────────────────────────────────────────────
// self.__WB_MANIFEST is replaced at build time with the precache manifest
precacheAndRoute(self.__WB_MANIFEST);

// ─── IndexedDB helper (duplicated in SW context — cannot import app modules) ─
const DB_NAME = 'sas-share-store';
const DB_VERSION = 1;
const STORE_NAME = 'shared-files';

function idbOpen() {
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
