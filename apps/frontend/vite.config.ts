import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    // Optional tooling may be resolved from the repository root. Its React
    // peers must use this app's installation, including during prebundling.
    dedupe: ['react', 'react-dom'],
  },
  build: { rolldownOptions: { output: { codeSplitting: { groups: [
    { name: 'validation', test: /node_modules\/zod\// },
  ] } } } },
})
