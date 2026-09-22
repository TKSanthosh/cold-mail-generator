import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  root: __dirname,
  base: process.env.GITHUB_PAGES === 'true' ? '/cold-mail-generator/' : './',
  plugins: [react(), tailwindcss()],
})


