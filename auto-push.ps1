# Auto Push Script - Automatiškai padaro commit ir push
Write-Host "🚀 Pradedamas auto-push..." -ForegroundColor Green

# Patikrinkite, ar yra git
try {
    $gitVersion = git --version
    Write-Host "✅ Git rastas: $gitVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Git nerastas! Bandykite naudoti GitHub Desktop." -ForegroundColor Red
    Write-Host "💡 Atidarykite GitHub Desktop ir padarykite commit rankiniu būdu." -ForegroundColor Yellow
    exit 1
}

# Patikrinkite, ar yra .git folderis
if (-not (Test-Path ".git")) {
    Write-Host "❌ .git folderis nerastas! Repository nėra inicializuotas." -ForegroundColor Red
    Write-Host "💡 Naudokite GitHub Desktop arba 'git init'" -ForegroundColor Yellow
    exit 1
}

# Patikrinkite git status
Write-Host "📋 Tikrinamas git status..." -ForegroundColor Cyan
$status = git status --short

if ([string]::IsNullOrWhiteSpace($status)) {
    Write-Host "✅ Nėra pakeitimų commit'inti." -ForegroundColor Green
    exit 0
}

Write-Host "📝 Rasti pakeitimai:" -ForegroundColor Cyan
Write-Host $status

# Pridėkite visus failus
Write-Host "➕ Pridedami failai..." -ForegroundColor Cyan
git add .

# Padarykite commit
Write-Host "💾 Daromas commit..." -ForegroundColor Cyan
$commitMessage = "Fix PORT handling - use server.listen() instead of gameServer.listen()"
git commit -m $commitMessage

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Commit nepavyko!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Commit sėkmingas!" -ForegroundColor Green

# Push
Write-Host "📤 Push'inamas kodas..." -ForegroundColor Cyan
git push

if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️ Push nepavyko. Patikrinkite remote repository." -ForegroundColor Yellow
    Write-Host "💡 Bandykite: git push origin main" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Push sėkmingas!" -ForegroundColor Green
Write-Host ""
Write-Host "🎉 Viskas padaryta! Dabar eikite į Colyseus Cloud ir padarykite Redeploy." -ForegroundColor Green
Write-Host "📋 Colyseus Cloud → Deployments → Redeploy" -ForegroundColor Cyan

