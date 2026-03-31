import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  server: {
    proxy: {
      '/api/te-aka': {
        target: 'https://maoridictionary.co.nz',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/te-aka/, ''),
      },
    },
  },
})
