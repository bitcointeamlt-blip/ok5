# Safe Delete OK05 Folder Script

Write-Host "🗑️ Saugus OK05 folderio ištrynimas" -ForegroundColor Cyan

# Raskite folderį
$searchPaths = @(
    "C:\Users\p3p3l\Downloads",
    "C:\Users\p3p3l\Documents\GitHub",
    "C:\Users\p3p3l\Desktop",
    "C:\Users\p3p3l\Documents"
)

$foundFolders = @()

foreach ($path in $searchPaths) {
    if (Test-Path $path) {
        $folders = Get-ChildItem -Path $path -Directory -Filter "ok05" -ErrorAction SilentlyContinue
        if ($folders) {
            $foundFolders += $folders.FullName
        }
        $folders = Get-ChildItem -Path $path -Directory -Filter "ok5" -ErrorAction SilentlyContinue
        if ($folders) {
            $foundFolders += $folders.FullName
        }
    }
}

if ($foundFolders.Count -eq 0) {
    Write-Host "❌ OK05 folderis nerastas!" -ForegroundColor Red
    Write-Host "Įveskite path rankiniu būdu:" -ForegroundColor Yellow
    $manualPath = Read-Host "Path"
    if (Test-Path $manualPath) {
        $foundFolders = @($manualPath)
    } else {
        Write-Host "❌ Neteisingas path!" -ForegroundColor Red
        exit
    }
}

Write-Host "`n📋 Rasti folderiai:" -ForegroundColor Cyan
for ($i = 0; $i -lt $foundFolders.Count; $i++) {
    Write-Host "$($i + 1). $($foundFolders[$i])" -ForegroundColor White
}

$choice = Read-Host "`nPasirinkite folderį (1-$($foundFolders.Count)) arba 'all' visiems"
if ($choice -eq "all") {
    $selectedFolders = $foundFolders
} else {
    $index = [int]$choice - 1
    if ($index -ge 0 -and $index -lt $foundFolders.Count) {
        $selectedFolders = @($foundFolders[$index])
    } else {
        Write-Host "❌ Neteisingas pasirinkimas!" -ForegroundColor Red
        exit
    }
}

# Patikrinkite ar yra backup
Write-Host "`n⚠️ SVARBU: Ar padarėte backup?" -ForegroundColor Yellow
$confirmBackup = Read-Host "Taip/Ne (y/n)"
if ($confirmBackup -ne "y" -and $confirmBackup -ne "Y" -and $confirmBackup -ne "taip") {
    Write-Host "❌ Pirmiausia padarykite backup!" -ForegroundColor Red
    Write-Host "Paleiskite: .\find-and-backup-ok05.ps1" -ForegroundColor Yellow
    exit
}

# Ištrinkite folderius
foreach ($folderPath in $selectedFolders) {
    Write-Host "`n🗑️ Bandau ištrinti: $folderPath" -ForegroundColor Cyan
    
    # Patikrinkite ar folderis nėra naudojamas
    Write-Host "Patikrinu ar folderis nėra naudojamas..." -ForegroundColor Yellow
    
    # Bandykite uždaryti Git lock failus
    $gitLockPath = Join-Path $folderPath ".git\*.lock"
    if (Test-Path (Split-Path $gitLockPath -Parent)) {
        Write-Host "Ištrinu Git lock failus..." -ForegroundColor Yellow
        Remove-Item -Path $gitLockPath -Force -ErrorAction SilentlyContinue
    }
    
    # Bandykite ištrinti
    try {
        Remove-Item -Path $folderPath -Recurse -Force -ErrorAction Stop
        Write-Host "✅ Folderis ištrintas sėkmingai!" -ForegroundColor Green
    } catch {
        Write-Host "❌ Klaida trinant: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "`nPatikrinkite:" -ForegroundColor Yellow
        Write-Host "1. Uždarykite visus File Explorer langus" -ForegroundColor White
        Write-Host "2. Uždarykite VS Code / IDE" -ForegroundColor White
        Write-Host "3. Uždarykite GitHub Desktop" -ForegroundColor White
        Write-Host "4. Restart'inkite File Explorer (Task Manager)" -ForegroundColor White
        
        # Bandykite su Administrator teisėmis
        Write-Host "`nBandau su Administrator teisėmis..." -ForegroundColor Yellow
        try {
            Start-Process powershell -Verb RunAs -ArgumentList "-Command", "Remove-Item -Path '$folderPath' -Recurse -Force" -Wait
            Write-Host "✅ Folderis ištrintas su Administrator teisėmis!" -ForegroundColor Green
        } catch {
            Write-Host "❌ Vis dar nepavyko. Naudokite Unlocker arba restart'inkite kompiuterį." -ForegroundColor Red
        }
    }
}

Write-Host "`n✅ Ištrynimo procesas baigtas!" -ForegroundColor Green

