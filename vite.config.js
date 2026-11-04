import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Relative asset paths by default, so the build runs from any folder or host (custom
  // platforms, sub-paths, GitHub Pages). BASE_PATH can still force an absolute base.
  base: process.env.BASE_PATH || './',
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8787' },
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
  },
  plugins: [
    // Vite marks the game's own script and stylesheet `crossorigin`; some hosting platforms
    // serve files without CORS headers, which makes the browser refuse them. Same-origin
    // files don't need it, so drop it from our own assets.
    {
      name: 'strip-asset-crossorigin',
      enforce: 'post',
      transformIndexHtml: (html) => html.replace(/<(script|link)([^>]*?) crossorigin([^>]*?(?:src|href)="[^"]*assets\/[^"]*")/g, '<$1$2$3'),
    },
    VitePWA({
      registerType: 'autoUpdate',
      // plain .json manifest (some hosts reject .webmanifest files)
      manifestFilename: 'manifest.json',
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
