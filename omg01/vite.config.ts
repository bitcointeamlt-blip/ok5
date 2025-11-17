import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 7005,
    open: true,
    host: 'localhost'
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false
  }
})

