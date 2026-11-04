import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // GitHub Pages serves the site from /<repo>/; set BASE_PATH there. Locally it's '/'.
  base: process.env.BASE_PATH || '/',
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8787' },
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg'],
      manifest: {
        name: 'Vampire Samurai',
        short_name: 'VampSamurai',
        description: 'Guard the ancient temple ruins. Survive the waves.',
        theme_color: '#1a1410',
        background_color: '#0b0a08',
        display: 'fullscreen',
        orientation: 'any',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        runtimeCaching: [
          { urlPattern: /\/api\//, handler: 'NetworkOnly' },
          // typefaces: fetched once from Google Fonts, then served offline
          { urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//, handler: 'CacheFirst', options: { cacheName: 'fonts', expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 365 }, cacheableResponse: { statuses: [0, 200] } } },
        ],
      },
    }),
  ],
});
