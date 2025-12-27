# Start Local Servers Script

Write-Host "🚀 Paleidžiu lokalius serverius..." -ForegroundColor Cyan

# Patikrinkite ar portai laisvi
Write-Host "`n🔍 Patikrinu ar portai laisvi..." -ForegroundColor Yellow

$port7005 = netstat -ano | findstr ":7005"
$port2567 = netstat -ano | findstr ":2567"
$port5173 = netstat -ano | findstr ":5173"

if ($port7005) {
    Write-Host "⚠️ Port 7005 užimtas!" -ForegroundColor Yellow
    Write-Host "Paleiskite: .\restart-local-servers.ps1" -ForegroundColor Yellow
    exit
}

if ($port2567) {
    Write-Host "⚠️ Port 2567 užimtas!" -ForegroundColor Yellow
    Write-Host "Paleiskite: .\restart-local-servers.ps1" -ForegroundColor Yellow
    exit
}

if ($port5173) {
    Write-Host "⚠️ Port 5173 užimtas!" -ForegroundColor Yellow
    Write-Host "Paleiskite: .\restart-local-servers.ps1" -ForegroundColor Yellow
    exit
}

Write-Host "✅ Visi portai laisvi" -ForegroundColor Green

# Paleiskite Colyseus serverį
Write-Host "`n🔵 Paleidžiu Colyseus serverį..." -ForegroundColor Cyan
$colyseusPath = Join-Path $PSScriptRoot "colyseus-server"

if (Test-Path $colyseusPath) {
    Write-Host "Colyseus server path: $colyseusPath" -ForegroundColor Yellow
    
    # Patikrinkite ar yra node_modules
    if (-not (Test-Path (Join-Path $colyseusPath "node_modules"))) {
        Write-Host "Instaliuoju dependencies..." -ForegroundColor Yellow
        Set-Location $colyseusPath
        npm install
        Set-Location $PSScriptRoot
    }
    
    # Paleiskite Colyseus serverį naujame terminale
    Write-Host "Paleidžiu Colyseus serverį naujame PowerShell lange..." -ForegroundColor Yellow
    # Force expected port for local dev
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "`$env:PORT='2567'; cd '$colyseusPath'; npm run dev"
    Write-Host "✅ Colyseus serveris paleistas" -ForegroundColor Green
} else {
    Write-Host "❌ Colyseus server folderis nerastas: $colyseusPath" -ForegroundColor Red
}

# Palaukite kol Colyseus serveris start'ina
Write-Host "`n⏳ Laukiu 5 sekundes kol Colyseus serveris start'ina..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Quick health check (best effort)
try {
    $health = Invoke-WebRequest -UseBasicParsing "http://localhost:2567/health" -TimeoutSec 2
    if ($health.StatusCode -eq 200) {
        Write-Host "✅ Colyseus /health OK" -ForegroundColor Green
    } else {
        Write-Host "⚠️ Colyseus /health returned status $($health.StatusCode)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠️ Colyseus /health nepasiekiamas. Patikrinkite Colyseus terminalą (gal serveris krito su klaida)." -ForegroundColor Yellow
}

# Paleiskite Frontend serverį
Write-Host "`n🟢 Paleidžiu Frontend serverį..." -ForegroundColor Cyan

# Patikrinkite ar yra node_modules
if (-not (Test-Path (Join-Path $PSScriptRoot "node_modules"))) {
    Write-Host "Instaliuoju dependencies..." -ForegroundColor Yellow
    npm install
}

# Paleiskite Frontend serverį naujame terminale
Write-Host "Paleidžiu Frontend serverį naujame PowerShell lange..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "`$env:VITE_COLYSEUS_ENDPOINT='http://localhost:2567'; cd '$PSScriptRoot'; npm run dev"
Write-Host "✅ Frontend serveris paleistas" -ForegroundColor Green

Write-Host "`n✅ Serveriai paleisti!" -ForegroundColor Green
Write-Host "`nAtidarykite:" -ForegroundColor Cyan
Write-Host "  - Frontend: http://localhost:7005" -ForegroundColor White
Write-Host "  - Colyseus: ws://localhost:2567" -ForegroundColor White
Write-Host "`nJei reikia restart'inti, paleiskite: .\restart-local-servers.ps1" -ForegroundColor Yellow

