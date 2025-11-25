# PowerShell script to automatically build GG7.zip for Netlify deployment
# This ensures the game is always ready for online testing

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Building GG7.zip for Netlify..." -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan

# Step 1: Update GG7 folder with latest files
Write-Host "`n[1/3] Updating GG7 folder..." -ForegroundColor Yellow

if (-not (Test-Path "GG7")) {
    New-Item -ItemType Directory -Path "GG7" | Out-Null
    Write-Host "Created GG7 folder" -ForegroundColor Gray
}

# Copy all necessary files
Write-Host "Copying source files..." -ForegroundColor Gray
Copy-Item -Recurse -Path "src" -Destination "GG7\src" -Force | Out-Null
Copy-Item -Path "package.json" -Destination "GG7\package.json" -Force | Out-Null
Copy-Item -Path "tsconfig.json" -Destination "GG7\tsconfig.json" -Force | Out-Null
Copy-Item -Path "vite.config.ts" -Destination "GG7\vite.config.ts" -Force | Out-Null
Copy-Item -Path "netlify.toml" -Destination "GG7\netlify.toml" -Force | Out-Null
Copy-Item -Path "index.html" -Destination "GG7\index.html" -Force | Out-Null

# Copy .env file if it exists (for Supabase configuration)
if (Test-Path ".env") {
    Copy-Item -Path ".env" -Destination "GG7\.env" -Force | Out-Null
    Write-Host "Copied .env file" -ForegroundColor Gray
} else {
    Write-Host "Warning: .env file not found. Supabase may not work." -ForegroundColor Yellow
}

# Copy SQL setup files for reference
if (Test-Path "supabase-setup.sql") {
    Copy-Item -Path "supabase-setup.sql" -Destination "GG7\supabase-setup.sql" -Force | Out-Null
    Write-Host "Copied supabase-setup.sql" -ForegroundColor Gray
}
if (Test-Path "supabase-matchmaking-function.sql") {
    Copy-Item -Path "supabase-matchmaking-function.sql" -Destination "GG7\supabase-matchmaking-function.sql" -Force | Out-Null
    Write-Host "Copied supabase-matchmaking-function.sql" -ForegroundColor Gray
}

$fileCount = (Get-ChildItem "GG7" -Recurse -File).Count
Write-Host "[OK] GG7 folder updated ($fileCount files)" -ForegroundColor Green

# Step 2: Create ZIP with Unix paths using Python
Write-Host "`n[2/3] Creating GG7.zip with Unix paths..." -ForegroundColor Yellow

if (Test-Path "GG7.zip") {
    Remove-Item -Force "GG7.zip"
}

# Use Python to create ZIP with correct path separators
python create-GG7-zip-unix.py 2>&1 | Out-Null

if (Test-Path "GG7.zip") {
    $zipSize = (Get-Item "GG7.zip").Length / 1KB
    Write-Host "[OK] GG7.zip created ($([math]::Round($zipSize, 2)) KB)" -ForegroundColor Green
} else {
    Write-Host "[ERROR] Failed to create GG7.zip" -ForegroundColor Red
    exit 1
}

# Step 3: Verify critical files
Write-Host "`n[3/3] Verifying critical files..." -ForegroundColor Yellow

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead("$PWD\GG7.zip")
$critical = @(
    "src/services/WalletService.ts",
    "src/services/SupabaseService.ts",
    "src/services/MatchmakingService.ts",
    "src/services/PvPSyncService.ts",
    "src/persistence/SaveDataV2.ts",
    "src/persistence/SaveManagerV2.ts",
    "src/vite-env.d.ts",
    "index.html"
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
    Write-Host "GG7.zip is ready for Netlify deployment!" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "1. Go to: https://app.netlify.com" -ForegroundColor White
    Write-Host "2. Click 'Deploy manually'" -ForegroundColor White
    Write-Host "3. Upload: GG7.zip" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Note: Make sure to set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY" -ForegroundColor Yellow
    Write-Host "      in Netlify environment variables for PvP Online to work!" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "IMPORTANT: Run supabase-matchmaking-function.sql in Supabase SQL Editor" -ForegroundColor Yellow
    Write-Host "           to enable automatic matchmaking!" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "What's new in GG7:" -ForegroundColor Cyan
    Write-Host "- Fixed player positions (P1 left, P2 right - consistent for both players)" -ForegroundColor White
    Write-Host "- Fixed player colors (blue for you, red for opponent - always correct)" -ForegroundColor White
    Write-Host "- Player control validation (only your player is controllable)" -ForegroundColor White
    Write-Host "- Wallet address suffix (last 4 chars) in player labels" -ForegroundColor White
    Write-Host "- Real-time position sync (100ms interval) for smooth PvP" -ForegroundColor White
    Write-Host "- Automatic matchmaking (requires SQL function setup)" -ForegroundColor White
    Write-Host "- Responsive design for all screen sizes" -ForegroundColor White
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "[ERROR] BUILD FAILED - Missing critical files!" -ForegroundColor Red
    exit 1
}

