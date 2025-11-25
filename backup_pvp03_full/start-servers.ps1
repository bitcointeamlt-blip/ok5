# Start Colyseus server and Frontend server
Write-Host "Paleidžiu Colyseus serverį ant 2567..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\colyseus-server'; npm run dev" -WindowStyle Minimized

Start-Sleep -Seconds 3

Write-Host "Paleidžiu Frontend serverį ant 7005..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot'; npm run dev" -WindowStyle Minimized

Write-Host "`n✅ Serveriai paleidžiami..." -ForegroundColor Green
Write-Host "Frontend: http://localhost:7005" -ForegroundColor Yellow
Write-Host "Colyseus: http://localhost:2567" -ForegroundColor Yellow
Write-Host "`nPalaukite ~10 sekundžių, kol serveriai pasileis." -ForegroundColor Gray

