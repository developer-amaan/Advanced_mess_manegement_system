import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const apiProxy = {
  target: process.env.MESSMETER_API_PROXY || 'http://localhost:4000',
  changeOrigin: true,
  configure: (proxy) => proxy.on('proxyReq', (proxyRequest) => proxyRequest.removeHeader('origin')),
};

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['pwa-icon.svg'],
      manifest: {
        id: '/',
        name: 'Shivalik Mess Meter',
        short_name: 'Shivalik Mess',
        description: 'A smarter way to plan meals, rescue surplus food, and turn scraps into compost.',
        theme_color: '#f7f8fa',
        background_color: '#f7f8fa',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        categories: ['food', 'education', 'productivity'],
        icons: [
          { src: '/pwa-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,webmanifest}'],
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/[^/]+\/api\/.*/i,
            handler: 'NetworkOnly',
            method: 'GET',
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { port: 5173, allowedHosts: ['.trycloudflare.com', '.loca.lt'], proxy: { '/api': apiProxy } },
  preview: {
    port: Number(process.env.PREVIEW_PORT) || 5173,
    host: '0.0.0.0',
    allowedHosts: ['.trycloudflare.com', '.loca.lt'],
    proxy: { '/api': apiProxy },
  },
});
