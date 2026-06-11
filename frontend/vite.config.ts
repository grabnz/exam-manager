import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['pwa-192.png', 'pwa-512.png', 'pwa-512-maskable.png'],
      manifest: {
        name: 'دفتر الأعداد — إدارة النقاط',
        short_name: 'دفتر الأعداد',
        description: 'تسجيل أعداد التقييمات والامتحانات للمدرسة الابتدائية — يعمل دون اتصال',
        dir: 'rtl',
        lang: 'ar',
        display: 'standalone',
        start_url: '/',
        background_color: '#f9fafb',
        theme_color: '#2563eb',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        // GET API responses (any origin): network first, fall back to cache
        // so a class opened once online stays usable in the classroom offline.
        runtimeCaching: [
          {
            urlPattern: ({ url, request }) =>
              request.method === 'GET' && url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 14 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
