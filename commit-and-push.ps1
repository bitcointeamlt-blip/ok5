# PowerShell script to commit and push changes to GitHub

# Add changed files
git add colyseus-server/ecosystem.config.js
git add colyseus-server/src/index.ts
git add src/simple-main.ts
git add src/services/ColyseusService.ts

# Commit with message
git commit -m "Fix EADDRINUSE and local development - prevent multiple PM2 instances and fix localhost endpoint"

# Push to GitHub
git push origin main

Write-Host "✅ Code committed and pushed to GitHub!" -ForegroundColor Green
Write-Host "⏳ Colyseus Cloud will automatically deploy in 2-5 minutes" -ForegroundColor Yellow
Write-Host "⏳ Netlify will automatically deploy in 2-3 minutes" -ForegroundColor Yellow



