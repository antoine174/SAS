import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      injectRegister: 'auto',

      manifest: {
        // 'id' is required for WebAPK minting — must match scope
        id: '/',
        name: 'SAS للتخليص الجمركي',
        short_name: 'SAS',
        description: 'نظام التخليص الجمركي SAS – رفع ودمج مستندات التخليص الجمركية',
        theme_color: '#2563eb',
        background_color: '#f8fafc',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        dir: 'rtl',
        lang: 'ar',

        // ── Icons ─────────────────────────────────────────────────────────────
        // Android WebAPK minting server REQUIRES real PNG icons.
        // SVG-only manifests are silently downgraded to plain bookmarks
        // which cannot register a share_target with the OS.
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],

        // ── Web Share Target ──────────────────────────────────────────────────
        // action MUST be '/quick-upload' — the Service Worker intercepts the
        // POST there, stores the PDF in IndexedDB, and redirects to /quick-upload
        // so the file is available even if the user has to log in first.
        //
        // accept includes 'application/octet-stream' because some Android apps
        // (including certain CamScanner versions) broadcast PDF files under the
        // generic binary MIME type instead of 'application/pdf'.
        share_target: {
          action: '/quick-upload',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            title: 'title',
            text: 'text',
            url: 'url',
            files: [
              {
                name: 'file',
                accept: [
                  'application/pdf',
                  '.pdf',
                  'application/octet-stream',
                ],
              },
            ],
          },
        },
      },

      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      },

      devOptions: {
        enabled: false,
      },
    }),
  ],

  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
