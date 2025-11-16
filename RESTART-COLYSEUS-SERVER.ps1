# PowerShell Script: Restart Colyseus Server
# Naudojimas: .\RESTART-COLYSEUS-SERVER.ps1

Write-Host "🔄 Restart'inamas Colyseus serveris..." -ForegroundColor Cyan
Write-Host ""

# Rasti Colyseus serverio procesą
Write-Host "🔍 Ieškoma Colyseus serverio proceso..." -ForegroundColor Yellow
$colyseusProcess = netstat -ano | findstr :2567 | Select-Object -First 1
if ($colyseusProcess) {
    $pid = ($colyseusProcess -split '\s+')[-1]
    Write-Host "✅ Rastas procesas PID: $pid" -ForegroundColor Green
    Write-Host "💡 Uždarymas procesas..." -ForegroundColor Yellow
    taskkill /PID $pid /F 2>$null
    Start-Sleep -Seconds 2
} else {
    Write-Host "⚠️  Colyseus serverio procesas nerastas" -ForegroundColor Yellow
}

# Build serveris
Write-Host ""
Write-Host "🔨 Build'inamas Colyseus serveris..." -ForegroundColor Cyan
Set-Location colyseus-server
npm run build
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Build sėkmingas!" -ForegroundColor Green
} else {
    Write-Host "❌ Build nepavyko!" -ForegroundColor Red
    exit 1
}

# Paleisti serverį
Write-Host ""
Write-Host "🚀 Paleidžiamas Colyseus serveris..." -ForegroundColor Cyan
Write-Host "💡 Serveris bus paleistas naujame terminale" -ForegroundColor Yellow
Write-Host ""

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd colyseus-server; npm run dev"

Write-Host "✅ Colyseus serveris paleistas!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Patikrinkite:" -ForegroundColor Cyan
Write-Host "   1. Ar serveris start'ina naujame terminale" -ForegroundColor White
Write-Host "   2. Ar health endpoint veikia: curl http://localhost:2567/health" -ForegroundColor White
Write-Host "   3. Ar frontend gali prisijungti" -ForegroundColor White
Write-Host ""

Set-Location ..

