import { defineConfig } from 'vite'
import { readFileSync } from 'fs'

// Read package.json to get version
const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'))
const version = packageJson.version || '1.0.19'
// Create unique build ID: version + timestamp
const buildId = `${version}-${Date.now()}`

export default defineConfig({
  server: {
    port: 7000,
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
    assetsDir: 'assets',
    sourcemap: false,
    // Force include all modules - prevent tree-shaking from removing needed code
    rollupOptions: {
      output: {
        manualChunks: undefined, // Don't split chunks - bundle everything together
        // Force unique filename with version + timestamp to ensure new hash every build
        entryFileNames: `assets/[name]-[hash]-${buildId}.js`,
        chunkFileNames: `assets/[name]-[hash]-${buildId}.js`,
        assetFileNames: `assets/[name]-[hash]-${buildId}.[ext]`
      }
    }
  }
  // Vite automatically loads .env files and makes VITE_* variables available via import.meta.env
})
