import { defineConfig } from 'vite'

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
    // Force include all modules - prevent tree-shaking from removing needed code
    rollupOptions: {
      output: {
        manualChunks: undefined // Don't split chunks - bundle everything together
      }
    }
  }
  // Vite automatically loads .env files and makes VITE_* variables available via import.meta.env
})

