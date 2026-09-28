/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png'],
      workbox: {
        // inclui o config/normalizacao-config.json no precache — a tabela de
        // normalização precisa estar disponível mesmo sem sinal (seção 6).
        globPatterns: ['**/*.{js,css,html,png,svg,json}'],
      },
      manifest: {
        name: 'Vistoria de Pavimento',
        short_name: 'Vistoria',
        description: 'PWA offline-first para vistoria de campo de pavimento rodoviário.',
        theme_color: '#262626',
        background_color: '#f7f7f5',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test-setup.ts'],
  },
})
