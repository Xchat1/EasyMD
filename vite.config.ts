import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { releaseArtifacts } from './scripts/release-artifacts.mjs'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.BASE_URL || '/',
  plugins: [react(), releaseArtifacts()],
  server: {
    port: 5174,
    strictPort: true,
    host: '127.0.0.1'
  }
})
