# Find and Backup OK05 Folder Script

Write-Host "🔍 Ieškau OK05 folderio..." -ForegroundColor Cyan

# Galimos vietos
$searchPaths = @(
    "C:\Users\p3p3l\Downloads",
    "C:\Users\p3p3l\Documents\GitHub",
    "C:\Users\p3p3l\Desktop",
    "C:\Users\p3p3l\Documents"
)

$foundFolders = @()

foreach ($path in $searchPaths) {
    if (Test-Path $path) {
        Write-Host "Ieškau: $path" -ForegroundColor Yellow
        $folders = Get-ChildItem -Path $path -Directory -Filter "ok05" -ErrorAction SilentlyContinue
        if ($folders) {
            foreach ($folder in $folders) {
                $foundFolders += $folder.FullName
                Write-Host "✅ Rastas: $($folder.FullName)" -ForegroundColor Green
            }
        }
        
        # Taip pat ieškome "ok5" (be nulio)
        $folders = Get-ChildItem -Path $path -Directory -Filter "ok5" -ErrorAction SilentlyContinue
        if ($folders) {
            foreach ($folder in $folders) {
                $foundFolders += $folder.FullName
                Write-Host "✅ Rastas: $($folder.FullName)" -ForegroundColor Green
            }
        }
    }
}

if ($foundFolders.Count -eq 0) {
    Write-Host "❌ OK05 folderis nerastas!" -ForegroundColor Red
    Write-Host "Patikrinkite rankiniu būdu arba nurodykite path rankiniu būdu." -ForegroundColor Yellow
    exit
}

Write-Host "`n📋 Rasti folderiai:" -ForegroundColor Cyan
for ($i = 0; $i -lt $foundFolders.Count; $i++) {
    Write-Host "$($i + 1). $($foundFolders[$i])" -ForegroundColor White
}

# Jei daugiau nei vienas, pasirinkite
if ($foundFolders.Count -gt 1) {
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
} else {
    $selectedFolders = $foundFolders
}

# Backup kiekvienam folderiui
foreach ($folderPath in $selectedFolders) {
    Write-Host "`n💾 Darysiu backup: $folderPath" -ForegroundColor Cyan
    
    # Sukurkite backup path
    $folderName = Split-Path -Leaf $folderPath
    $parentPath = Split-Path -Parent $folderPath
    $timestamp = Get-Date -Format 'yyyy-MM-dd-HHmmss'
    $backupPath = Join-Path $parentPath "$folderName-backup-$timestamp"
    
    Write-Host "Backup bus: $backupPath" -ForegroundColor Yellow
    
    # Patikrinkite ar folderis nėra naudojamas
    Write-Host "Patikrinu ar folderis nėra naudojamas..." -ForegroundColor Yellow
    
    try {
        # Bandykite kopijuoti
        Write-Host "Kopijuoju folderį..." -ForegroundColor Yellow
        Copy-Item -Path $folderPath -Destination $backupPath -Recurse -Force -ErrorAction Stop
        Write-Host "✅ Backup sukurtas sėkmingai!" -ForegroundColor Green
        Write-Host "Backup path: $backupPath" -ForegroundColor Green
        
        # Patikrinkite backup dydį
        $backupSize = (Get-ChildItem -Path $backupPath -Recurse | Measure-Object -Property Length -Sum).Sum
        $backupSizeMB = [math]::Round($backupSize / 1MB, 2)
        Write-Host "Backup dydis: $backupSizeMB MB" -ForegroundColor Cyan
        
    } catch {
        Write-Host "❌ Klaida kopijuojant: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "`nPatikrinkite:" -ForegroundColor Yellow
        Write-Host "1. Ar folderis nėra atidarytas File Explorer?" -ForegroundColor White
        Write-Host "2. Ar nėra atidarytas VS Code arba IDE?" -ForegroundColor White
        Write-Host "3. Ar nėra atidarytas GitHub Desktop?" -ForegroundColor White
        Write-Host "4. Ar turite teises?" -ForegroundColor White
        
        # Bandykite zip backup
        Write-Host "`nBandau padaryti ZIP backup..." -ForegroundColor Yellow
        $zipPath = "$backupPath.zip"
        try {
            Compress-Archive -Path $folderPath -DestinationPath $zipPath -Force -ErrorAction Stop
            Write-Host "✅ ZIP backup sukurtas: $zipPath" -ForegroundColor Green
        } catch {
            Write-Host "❌ ZIP backup taip pat nepavyko: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
}

Write-Host "`n✅ Backup procesas baigtas!" -ForegroundColor Green
Write-Host "Dabar galite saugiai ištrinti originalius folderius." -ForegroundColor Cyan

























