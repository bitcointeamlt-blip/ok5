# PowerShell script to create Netlify deploy ZIP with source files
# This script creates a ZIP file with all necessary source files for Netlify deployment
# Usage: npm run deploy:zip (or run this script directly)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Creating Netlify deploy ZIP..." -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan

# Create temporary directory
$tempDir = "netlify-deploy-temp"
if (Test-Path $tempDir) {
    Remove-Item -Recurse -Force $tempDir
}
New-Item -ItemType Directory -Path $tempDir | Out-Null

Write-Host "Copying source files..." -ForegroundColor Yellow

# Copy source files
Copy-Item -Recurse -Path "src" -Destination "$tempDir\src"
Copy-Item -Path "package.json" -Destination "$tempDir\package.json"
Copy-Item -Path "tsconfig.json" -Destination "$tempDir\tsconfig.json"
Copy-Item -Path "vite.config.ts" -Destination "$tempDir\vite.config.ts"
Copy-Item -Path "netlify.toml" -Destination "$tempDir\netlify.toml"
Copy-Item -Path "index.html" -Destination "$tempDir\index.html"

# Create ZIP file
$zipFile = "netlify-deploy.zip"
if (Test-Path $zipFile) {
    Remove-Item -Force $zipFile
}

Write-Host "Creating ZIP file: $zipFile" -ForegroundColor Yellow
Compress-Archive -Path "$tempDir\*" -DestinationPath $zipFile -Force

# Cleanup
Remove-Item -Recurse -Force $tempDir

$zipSize = (Get-Item $zipFile).Length / 1KB
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "ZIP file created successfully!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "File: $zipFile" -ForegroundColor Yellow
Write-Host "Size: $([math]::Round($zipSize, 2)) KB" -ForegroundColor Yellow
Write-Host "`nZIP contains:" -ForegroundColor Cyan
Write-Host "  - src/ folder (all source files)" -ForegroundColor White
Write-Host "  - package.json" -ForegroundColor White
Write-Host "  - tsconfig.json" -ForegroundColor White
Write-Host "  - vite.config.ts" -ForegroundColor White
Write-Host "  - netlify.toml" -ForegroundColor White
Write-Host "  - index.html" -ForegroundColor White
Write-Host "`nNext steps:" -ForegroundColor Cyan
Write-Host "1. Go to: https://app.netlify.com" -ForegroundColor White
Write-Host "2. Click 'Add new site' → 'Deploy manually'" -ForegroundColor White
Write-Host "3. Drag & drop: $zipFile" -ForegroundColor Yellow
Write-Host "4. Netlify will automatically:" -ForegroundColor White
Write-Host "   - Run: npm install and npm run build" -ForegroundColor Gray
Write-Host "   - Transform: 90 modules (not 6!)" -ForegroundColor Gray
Write-Host "   - Create: ~232 KB JavaScript bundle" -ForegroundColor Gray
Write-Host "5. Check build log - should see '90 modules transformed'" -ForegroundColor White
Write-Host "`nDone! Your ZIP is ready for Netlify!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan

