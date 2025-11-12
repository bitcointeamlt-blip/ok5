# PowerShell script to automatically build GG1.zip for Netlify deployment
# This ensures the game is always ready for online testing

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Building GG1.zip for Netlify..." -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan

# Step 1: Update GG1 folder with latest files
Write-Host "`n[1/3] Updating GG1 folder..." -ForegroundColor Yellow

if (-not (Test-Path "GG1")) {
    New-Item -ItemType Directory -Path "GG1" | Out-Null
    Write-Host "Created GG1 folder" -ForegroundColor Gray
}

# Copy all necessary files
Write-Host "Copying source files..." -ForegroundColor Gray
Copy-Item -Recurse -Path "src" -Destination "GG1\src" -Force | Out-Null
Copy-Item -Path "package.json" -Destination "GG1\package.json" -Force | Out-Null
Copy-Item -Path "tsconfig.json" -Destination "GG1\tsconfig.json" -Force | Out-Null
Copy-Item -Path "vite.config.ts" -Destination "GG1\vite.config.ts" -Force | Out-Null
Copy-Item -Path "netlify.toml" -Destination "GG1\netlify.toml" -Force | Out-Null
Copy-Item -Path "index.html" -Destination "GG1\index.html" -Force | Out-Null

$fileCount = (Get-ChildItem "GG1" -Recurse -File).Count
Write-Host "[OK] GG1 folder updated ($fileCount files)" -ForegroundColor Green

# Step 2: Create ZIP with Unix paths using Python
Write-Host "`n[2/3] Creating GG1.zip with Unix paths..." -ForegroundColor Yellow

if (Test-Path "GG1.zip") {
    Remove-Item -Force "GG1.zip"
}

# Use Python to create ZIP with correct path separators
python create-GG1-zip-unix.py 2>&1 | Out-Null

if (Test-Path "GG1.zip") {
    $zipSize = (Get-Item "GG1.zip").Length / 1KB
    Write-Host "[OK] GG1.zip created ($([math]::Round($zipSize, 2)) KB)" -ForegroundColor Green
} else {
    Write-Host "[ERROR] Failed to create GG1.zip" -ForegroundColor Red
    exit 1
}

# Step 3: Verify critical files
Write-Host "`n[3/3] Verifying critical files..." -ForegroundColor Yellow

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead("$PWD\GG1.zip")
$critical = @(
    "src/services/WalletService.ts",
    "src/services/SupabaseService.ts",
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
    Write-Host "GG1.zip is ready for Netlify deployment!" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "1. Go to: https://app.netlify.com" -ForegroundColor White
    Write-Host "2. Click 'Deploy manually'" -ForegroundColor White
    Write-Host "3. Upload: GG1.zip" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "[ERROR] BUILD FAILED - Missing critical files!" -ForegroundColor Red
    exit 1
}

