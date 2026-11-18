/// <reference lib="webworker" />
/* eslint-env serviceworker */
/**
 * Custom Service Worker — injectManifest strategy.
 *
 * 1. Immediate activation via skipWaiting() & clients.claim()
 * 2. Intercepts the Share Target POST from the OS share sheet,
 *    stores the shared PDF into IndexedDB, and redirects to /?quickUpload=1.
 * 3. Precaches the app shell via Workbox.
 * 4. Intercepts GET SPA navigations (/quick-upload, /consignment/:id) and serves index.html.
 */

import { precacheAndRoute } from 'workbox-precaching';

// ─── Lifecycle: Immediate Activation ─────────────────────────────────────────
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// ─── 1. Intercept POST Share Target from CamScanner ──────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (
    event.request.method === 'POST' &&
    (url.pathname === '/quick-upload' ||
      url.pathname.endsWith('/quick-upload') ||
      url.pathname.endsWith('/share-target') ||
      url.pathname === '/')
  ) {
    event.respondWith(
      (async () => {
        try {
          const formData = await event.request.formData();
          const file =
            formData.get('file') ||
            formData.get('sharedFile') ||
            formData.get('pdf') ||
            Array.from(formData.values()).find((v) => v instanceof File);

          if (file) {
            await saveSharedFile(file);
          }
        } catch (err) {
          console.error('SW Share Target error:', err);
        }
        // Redirect to root with ?quickUpload=1 (Root '/' NEVER 404s on Vercel!)
        return Response.redirect('/?quickUpload=1', 303);
      })()
    );
    return;
  }
});

// ─── Workbox Precaching ──────────────────────────────────────────────────────
precacheAndRoute(self.__WB_MANIFEST || []);

// ─── 2. Intercept GET SPA navigations and serve index.html ───────────────────
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate' && !event.request.url.includes('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.status === 404) {
            return caches.match('/index.html').then((cached) => cached || fetch('/'));
          }
          return response;
        })
        .catch(() => caches.match('/index.html').then((cached) => cached || fetch('/')))
    );
  }
});

// ─── IndexedDB helper ────────────────────────────────────────────────────────
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

async function saveSharedFile(file) {
  if (!file) return;
  const buffer = await file.arrayBuffer();
  const db = await idbOpen();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).put({
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
