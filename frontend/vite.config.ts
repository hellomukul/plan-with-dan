import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In dev, Vite serves the UI and forwards API + calendar-feed calls to FastAPI on :8000.
// In production FastAPI serves the built files itself, so everything is one origin.
const api = `http://127.0.0.1:${process.env.API_PORT ?? '8000'}`

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': api,
      '/cal': api,
    },
  },
})
