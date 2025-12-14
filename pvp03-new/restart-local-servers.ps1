# Restart Local Servers Script

Write-Host "🔄 Restart'inu lokalius serverius..." -ForegroundColor Cyan

# Raskite Node procesus
Write-Host "`n🔍 Ieškau Node procesų..." -ForegroundColor Yellow
$nodeProcesses = Get-Process | Where-Object {$_.ProcessName -like "*node*" -or $_.ProcessName -like "*vite*"}

if ($nodeProcesses) {
    Write-Host "Rasti procesai:" -ForegroundColor Yellow
    $nodeProcesses | ForEach-Object {
        Write-Host "  - $($_.ProcessName) (ID: $($_.Id))" -ForegroundColor White
    }
    
    Write-Host "`n🛑 Uždarysiu Node procesus..." -ForegroundColor Yellow
    $nodeProcesses | ForEach-Object {
        try {
            Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
            Write-Host "✅ Uždarytas: $($_.ProcessName) (ID: $($_.Id))" -ForegroundColor Green
        } catch {
            Write-Host "⚠️ Nepavyko uždaryti: $($_.ProcessName) (ID: $($_.Id))" -ForegroundColor Yellow
        }
    }
    
    # Palaukite kol procesai užsidarys
    Write-Host "`n⏳ Laukiu 3 sekundes..." -ForegroundColor Yellow
    Start-Sleep -Seconds 3
} else {
    Write-Host "✅ Nėra aktyvių Node procesų" -ForegroundColor Green
}

# Patikrinkite portus
Write-Host "`n🔍 Patikrinu portus..." -ForegroundColor Yellow

$port7005 = netstat -ano | findstr ":7005"
$port2567 = netstat -ano | findstr ":2567"
$port5173 = netstat -ano | findstr ":5173"

if ($port7005) {
    Write-Host "⚠️ Port 7005 vis dar užimtas:" -ForegroundColor Yellow
    Write-Host $port7005 -ForegroundColor White
    
    # Ištraukite PID
    $pid = ($port7005 -split '\s+')[-1]
    if ($pid) {
        Write-Host "Bandau uždaryti procesą su PID: $pid" -ForegroundColor Yellow
        try {
            Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
            Write-Host "✅ Procesas uždarytas" -ForegroundColor Green
        } catch {
            Write-Host "⚠️ Nepavyko uždaryti proceso" -ForegroundColor Yellow
        }
    }
}

if ($port2567) {
    Write-Host "⚠️ Port 2567 vis dar užimtas:" -ForegroundColor Yellow
    Write-Host $port2567 -ForegroundColor White
    
    $pid = ($port2567 -split '\s+')[-1]
    if ($pid) {
        Write-Host "Bandau uždaryti procesą su PID: $pid" -ForegroundColor Yellow
        try {
            Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
            Write-Host "✅ Procesas uždarytas" -ForegroundColor Green
        } catch {
            Write-Host "⚠️ Nepavyko uždaryti proceso" -ForegroundColor Yellow
        }
    }
}

if ($port5173) {
    Write-Host "⚠️ Port 5173 vis dar užimtas:" -ForegroundColor Yellow
    Write-Host $port5173 -ForegroundColor White
    
    $pid = ($port5173 -split '\s+')[-1]
    if ($pid) {
        Write-Host "Bandau uždaryti procesą su PID: $pid" -ForegroundColor Yellow
        try {
            Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
            Write-Host "✅ Procesas uždarytas" -ForegroundColor Green
        } catch {
            Write-Host "⚠️ Nepavyko uždaryti proceso" -ForegroundColor Yellow
        }
    }
}

# Palaukite dar kartą
Write-Host "`n⏳ Laukiu 2 sekundes..." -ForegroundColor Yellow
Start-Sleep -Seconds 2

# Patikrinkite ar portai laisvi
Write-Host "`n🔍 Patikrinu ar portai laisvi..." -ForegroundColor Yellow
$port7005After = netstat -ano | findstr ":7005"
$port2567After = netstat -ano | findstr ":2567"
$port5173After = netstat -ano | findstr ":5173"

if (-not $port7005After) {
    Write-Host "✅ Port 7005 laisvas" -ForegroundColor Green
} else {
    Write-Host "⚠️ Port 7005 vis dar užimtas" -ForegroundColor Yellow
}

if (-not $port2567After) {
    Write-Host "✅ Port 2567 laisvas" -ForegroundColor Green
} else {
    Write-Host "⚠️ Port 2567 vis dar užimtas" -ForegroundColor Yellow
}

if (-not $port5173After) {
    Write-Host "✅ Port 5173 laisvas" -ForegroundColor Green
} else {
    Write-Host "⚠️ Port 5173 vis dar užimtas" -ForegroundColor Yellow
}

Write-Host "`n✅ Restart procesas baigtas!" -ForegroundColor Green
Write-Host "`nDabar galite paleisti serverius:" -ForegroundColor Cyan
Write-Host "1. Colyseus serveris: cd colyseus-server && npm run dev" -ForegroundColor White
Write-Host "2. Frontend: npm run dev" -ForegroundColor White








