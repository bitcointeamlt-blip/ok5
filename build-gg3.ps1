# PowerShell script to automatically build GG3.zip for Netlify deployment
# This ensures the game is always ready for online testing

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Building GG3.zip for Netlify..." -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan

# Step 1: Update GG3 folder with latest files
Write-Host "`n[1/3] Updating GG3 folder..." -ForegroundColor Yellow

if (-not (Test-Path "GG3")) {
    New-Item -ItemType Directory -Path "GG3" | Out-Null
    Write-Host "Created GG3 folder" -ForegroundColor Gray
}

# Copy all necessary files
Write-Host "Copying source files..." -ForegroundColor Gray
Copy-Item -Recurse -Path "src" -Destination "GG3\src" -Force | Out-Null
Copy-Item -Path "package.json" -Destination "GG3\package.json" -Force | Out-Null
Copy-Item -Path "tsconfig.json" -Destination "GG3\tsconfig.json" -Force | Out-Null
Copy-Item -Path "vite.config.ts" -Destination "GG3\vite.config.ts" -Force | Out-Null
Copy-Item -Path "netlify.toml" -Destination "GG3\netlify.toml" -Force | Out-Null
Copy-Item -Path "index.html" -Destination "GG3\index.html" -Force | Out-Null

# Copy .env file if it exists (for Supabase configuration)
if (Test-Path ".env") {
    Copy-Item -Path ".env" -Destination "GG3\.env" -Force | Out-Null
    Write-Host "Copied .env file" -ForegroundColor Gray
} else {
    Write-Host "Warning: .env file not found. Supabase may not work." -ForegroundColor Yellow
}

$fileCount = (Get-ChildItem "GG3" -Recurse -File).Count
Write-Host "[OK] GG3 folder updated ($fileCount files)" -ForegroundColor Green

# Step 2: Create ZIP with Unix paths using Python
Write-Host "`n[2/3] Creating GG3.zip with Unix paths..." -ForegroundColor Yellow

if (Test-Path "GG3.zip") {
    Remove-Item -Force "GG3.zip"
}

# Use Python to create ZIP with correct path separators
python create-GG3-zip-unix.py 2>&1 | Out-Null

if (Test-Path "GG3.zip") {
    $zipSize = (Get-Item "GG3.zip").Length / 1KB
    Write-Host "[OK] GG3.zip created ($([math]::Round($zipSize, 2)) KB)" -ForegroundColor Green
} else {
    Write-Host "[ERROR] Failed to create GG3.zip" -ForegroundColor Red
    exit 1
}

# Step 3: Verify critical files
Write-Host "`n[3/3] Verifying critical files..." -ForegroundColor Yellow

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead("$PWD\GG3.zip")
$critical = @(
    "src/services/WalletService.ts",
    "src/services/SupabaseService.ts",
    "src/services/MatchmakingService.ts",
    "src/services/PvPSyncService.ts",
    "src/persistence/SaveDataV2.ts",
    "src/persistence/SaveManagerV2.ts",
    "src/vite-env.d.ts"
)

$allOk = $true
foreach ($file in $critical) {
    $found = $zip.Entries | Where-Object { $_.FullName -eq $file }
    if ($found) {
        Write-Host "  [OK] $file" -ForegroundColor Gray
    } else {
        Write-Host "  [MISSING] $file" -ForegroundColor Red
        $allOk = $false
    }
}
$zip.Dispose()

if ($allOk) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "[SUCCESS] BUILD COMPLETE!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "GG3.zip is ready for Netlify deployment!" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "1. Go to: https://app.netlify.com" -ForegroundColor White
    Write-Host "2. Click 'Deploy manually'" -ForegroundColor White
    Write-Host "3. Upload: GG3.zip" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Note: Make sure to set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY" -ForegroundColor Yellow
    Write-Host "      in Netlify environment variables for PvP Online to work!" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "[ERROR] BUILD FAILED - Missing critical files!" -ForegroundColor Red
    exit 1
}

