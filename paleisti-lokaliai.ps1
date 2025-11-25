# PowerShell Script: Paleisti Lokalią Versiją
# Naudojimas: .\paleisti-lokaliai.ps1

Write-Host "🚀 Paleidžiama lokali versija..." -ForegroundColor Cyan
Write-Host ""

# Patikrinti, ar Colyseus serveris veikia
Write-Host "🔍 Patikrinama, ar Colyseus serveris veikia..." -ForegroundColor Yellow
$colyseusRunning = netstat -ano | findstr :2567
if ($colyseusRunning) {
    Write-Host "✅ Colyseus serveris jau veikia" -ForegroundColor Green
} else {
    Write-Host "⚠️  Colyseus serveris NEVEIKIA" -ForegroundColor Yellow
    Write-Host "💡 Paleiskite Colyseus serverį kitu terminalu:" -ForegroundColor Cyan
    Write-Host "   cd colyseus-server" -ForegroundColor White
    Write-Host "   npm run dev" -ForegroundColor White
    Write-Host ""
    $startColyseus = Read-Host "Ar norite paleisti Colyseus serverį dabar? (y/n)"
    if ($startColyseus -eq "y") {
        Write-Host "🚀 Paleidžiamas Colyseus serveris..." -ForegroundColor Cyan
        Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd colyseus-server; npm run dev"
        Write-Host "⏳ Palaukite 5 sekundes, kol serveris start'ina..." -ForegroundColor Yellow
        Start-Sleep -Seconds 5
    }
}

# Patikrinti, ar portas 7000 užimtas
Write-Host ""
Write-Host "🔍 Patikrinama, ar portas 7000 užimtas..." -ForegroundColor Yellow
$port7000 = netstat -ano | findstr :7000
if ($port7000) {
    Write-Host "⚠️  Portas 7000 užimtas" -ForegroundColor Yellow
    Write-Host "💡 Uždarysime procesą..." -ForegroundColor Cyan
    $processes = netstat -ano | findstr :7000 | ForEach-Object { ($_ -split '\s+')[-1] } | Select-Object -Unique
    foreach ($pid in $processes) {
        if ($pid -and $pid -ne "0") {
            Write-Host "   Uždarymas procesas PID: $pid" -ForegroundColor White
            taskkill /PID $pid /F 2>$null
        }
    }
    Start-Sleep -Seconds 2
} else {
    Write-Host "✅ Portas 7000 laisvas" -ForegroundColor Green
}

# Paleisti frontend
Write-Host ""
Write-Host "🚀 Paleidžiamas frontend..." -ForegroundColor Cyan
Write-Host "💡 Frontend bus atidarytas naujame terminale" -ForegroundColor Yellow
Write-Host ""

Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run dev"

Write-Host "✅ Frontend paleistas!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Kitas žingsnis:" -ForegroundColor Cyan
Write-Host "   1. Palaukite, kol frontend start'ina" -ForegroundColor White
Write-Host "   2. Atidarykite browser: http://localhost:7000" -ForegroundColor White
Write-Host "   3. Patikrinkite browser console" -ForegroundColor White
Write-Host ""




