import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/stream': 'http://127.0.0.1:3001',
      '/playlist': 'http://127.0.0.1:3001',
      '/prefetch': 'http://127.0.0.1:3001'
    }
  }
})
