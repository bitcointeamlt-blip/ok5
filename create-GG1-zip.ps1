# PowerShell script to create GG1.zip for Netlify deployment
# This ensures all files are included with correct paths

Write-Host "Creating GG1.zip for Netlify..." -ForegroundColor Green

# Remove old ZIP
if (Test-Path "GG1.zip") {
    Remove-Item -Force "GG1.zip"
}

# Create ZIP using .NET method (ensures correct paths)
Add-Type -AssemblyName System.IO.Compression.FileSystem

$zipPath = Join-Path $PWD "GG1.zip"
$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)

# Add all files from GG1 folder
$gg1Path = Join-Path $PWD "GG1"
$files = Get-ChildItem -Path $gg1Path -Recurse -File

foreach ($file in $files) {
    $relativePath = $file.FullName.Substring($gg1Path.Length + 1)
    # Convert Windows path to Unix path for Netlify
    $entryName = $relativePath.Replace('\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file.FullName, $entryName) | Out-Null
    Write-Host "Added: $entryName" -ForegroundColor Gray
}

$zip.Dispose()

$zipSize = (Get-Item "GG1.zip").Length / 1KB
Write-Host "`nGG1.zip created successfully!" -ForegroundColor Green
Write-Host "Size: $([math]::Round($zipSize, 2)) KB" -ForegroundColor Yellow
Write-Host "Files: $($files.Count)" -ForegroundColor Yellow
Write-Host "`nReady to upload to Netlify!" -ForegroundColor Green


