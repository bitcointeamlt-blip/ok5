import { defineConfig } from 'vite'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Read package.json to get version
const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'))
const version = packageJson.version || '1.0.19'

export default defineConfig({
  base: './', // Use relative paths for deployment
  server: {
    port: 7005,
    open: true,
    host: 'localhost'
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        pewpew: resolve(__dirname, 'pewpew/index.html'),
        units: resolve(__dirname, 'units/index.html'),
        wavebreaker: resolve(__dirname, 'wavebreaker/index.html'),
      },
      output: {
        manualChunks: undefined,
        entryFileNames: `assets/[name]-[hash].js`,
        chunkFileNames: `assets/[name]-[hash].js`,
        assetFileNames: `assets/[name]-[hash].[ext]`
      }
    }
  }
})
