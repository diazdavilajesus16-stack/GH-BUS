import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    strictPort: true,
    // En desarrollo la API se pide al mismo origen (como detrás de nginx): así la cookie de sesión
    // (SameSite=Strict) funciona igual que en producción.
    proxy: { '/api': { target: 'http://localhost:8000', changeOrigin: false } },
  },
  test: { environment: 'node' },
})
