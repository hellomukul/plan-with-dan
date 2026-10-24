import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In dev, Vite serves the UI and forwards API + calendar-feed calls to FastAPI on :8000.
// In production FastAPI serves the built files itself, so everything is one origin.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/cal': 'http://127.0.0.1:8000',
    },
  },
})
