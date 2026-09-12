import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  build: {
    /*
     * Bundle classico (IIFE) invece che a moduli ES.
     *
     * Un documento a origine opaca — un iframe con sandbox senza
     * allow-same-origin, come certe anteprime — tratta ogni richiesta come
     * cross-origin, e uno <script type="module"> richiede CORS anche per il
     * proprio file: viene bloccato e la pagina resta bianca senza dire niente.
     * Uno script classico non ha quel vincolo. L'app è un chunk solo, quindi
     * non si perde nulla in caricamento differito.
     */
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'BYSIC — Pianificatore SOC Seal U DM-i',
        short_name: 'BYSIC',
        description:
          'Cosa impostare sull’auto e in quale punto del viaggio, per minimizzare benzina + elettricità.',
        theme_color: '#0b1220',
        background_color: '#0b1220',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        lang: 'it',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
