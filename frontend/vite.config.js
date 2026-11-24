import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { OFFLINE_CACHE_NAME } from './src/offline/resources.js';

export default defineConfig({
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8790',
    },
  },
  plugins: [
    react(),
    {
      name: 'preserve-home-render-blocking',
      // Vite replaces the entry script and drops its blocking attribute during a build.
      transformIndexHtml: {
        order: 'post',
        handler: (html) => html.replace(/<script type="module"(?![^>]*blocking=)/g, '<script type="module" blocking="render"'),
      },
    },
    VitePWA({
      injectRegister: 'auto',
      registerType: 'autoUpdate',
      // The Workbox glob already includes public images and manifest icons.
      // Adding them twice with different revisions prevents the worker from installing its routes.
      includeManifestIcons: false,
      manifest: {
        name: 'Surfare',
        short_name: 'Surfare',
        theme_color: '#0B2A6F',
        background_color: '#FAF3E8',
        display: 'standalone',
        start_url: '/',
        share_target: {
          action: '/share-target/',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            title: 'title', text: 'text', url: 'url',
            files: [{ name: 'images', accept: ['image/jpeg', 'image/png', 'image/webp', '.jpg', '.jpeg', '.png', '.webp'] }],
          },
        },
        icons: [
          {
            src: 'assets/pwa-64x64.png',
            sizes: '64x64',
            type: 'image/png',
          },
          {
            src: 'assets/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'assets/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'assets/maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        importScripts: ['/share-target.js'],
        // Receipt IDs select local data, not a different app shell.
        ignoreURLParametersMatching: [/^utm_/, /^fbclid$/, /^shared$/, /^shareError$/],
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,json,gz,wasm}'],
        globIgnores: ['tesseract/**', 'tessdata/**'],
        runtimeCaching: [{
          urlPattern: ({ url, sameOrigin }) => sameOrigin && /^\/(?:tesseract|tessdata)\//.test(url.pathname),
          handler: 'CacheFirst',
          options: { cacheName: OFFLINE_CACHE_NAME, cacheableResponse: { statuses: [200] } },
        }],
        maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
      },
    }),
  ],
});
