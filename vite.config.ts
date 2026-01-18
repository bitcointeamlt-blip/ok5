import { defineConfig } from 'vite'
import { readFileSync } from 'fs'

// Read package.json to get version
const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'))
const version = packageJson.version || '1.0.19'
// Create unique build ID: version + timestamp
const buildId = `${version}-${Date.now()}`

export default defineConfig({
  base: './', // Use relative paths for ZIP deployment
  server: {
    port: 7005,
    open: true,
    // Note: For Ronin Wallet to work, you need HTTPS
    // Option 1: Deploy to Netlify (recommended - automatic HTTPS)
    // Option 2: Use @vitejs/plugin-basic-ssl for local HTTPS
    // Option 3: Use localhost (should work without HTTPS)
    host: 'localhost' // Use localhost instead of 0.0.0.0 for better wallet compatibility
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    assetsDir: '', // Put assets in root for itch.io compatibility
    sourcemap: false,
    // Force include all modules - prevent tree-shaking from removing needed code
    rollupOptions: {
      output: {
        manualChunks: undefined, // Don't split chunks - bundle everything together
        // Add content hash to bust CDN cache on each deploy
        entryFileNames: `[name]-[hash].js`,
        chunkFileNames: `[name]-[hash].js`,
        assetFileNames: `[name]-[hash].[ext]`
      }
    }
  }
  // Vite automatically loads .env files and makes VITE_* variables available via import.meta.env
})
