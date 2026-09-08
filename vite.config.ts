import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png', 'quiet-tide.svg'],
      manifest: {
        name: 'Storied — a world of your own',
        short_name: 'Storied',
        description: 'A private, local-first writing and storytelling studio.',
        theme_color: '#171b1a',
        background_color: '#171b1a',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,woff2,wasm,data,gz,txt,storysystem}'],
        maximumFileSizeToCacheInBytes: 40 * 1024 * 1024,
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  worker: { format: 'es' },
  optimizeDeps: {
    exclude: [
      '@electric-sql/pglite',
      '@electric-sql/pglite-pgvector',
      '@huggingface/transformers',
      '@mlc-ai/web-llm',
    ],
  },
  build: { target: 'es2022', chunkSizeWarningLimit: 1800 },
})
