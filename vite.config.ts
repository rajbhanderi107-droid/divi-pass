import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/icon.svg'],
      manifest: {
        name: 'Divi Pass Register',
        short_name: 'Divi Pass',
        description: 'Record of Divi passes sold, prices, payments and dates',
        theme_color: '#0b0f0c',
        background_color: '#0b0f0c',
        display: 'standalone',
        start_url: './',
        icons: [{ src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
    }),
  ],
  test: { environment: 'node', include: ['src/**/*.test.ts'], env: { TZ: 'UTC' } },
});
