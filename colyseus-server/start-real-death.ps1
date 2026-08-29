# 💀 LOKALUS SERVERIS TIKRU MIRTIES REŽIMU
#
# Paleidžia F9 PvP serverį taip, kad žaidėjo NFT galėtų REALIAI žūti ir būti sudeginti grandinėje.
# Dukart spustelk arba paleisk: powershell -ExecutionPolicy Bypass -File start-real-death.ps1
#
# ⚠️ SAUGIKLIS IŠJUNGTAS. Bet kuris tavo NFT, kritęs mūšyje, turi 10% žūti negrįžtamai.
#    Nori saugaus režimo (miršta tik veidrodiniai tokenai) — paleisk start-safe-death.ps1

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

# jei portas užimtas — pasakom, o ne krentam nesuprantamai
$busy = Get-NetTCPConnection -LocalPort 2611 -State Listen -ErrorAction SilentlyContinue
if ($busy) {
  Write-Host "❌ Portas 2611 jau užimtas (PID $($busy.OwningProcess))." -ForegroundColor Red
  Write-Host "   Uždaryk tą langą arba: Stop-Process -Id $($busy.OwningProcess) -Force"
  Read-Host "`nEnter — išeiti"
  exit 1
}

$env:PORT               = '2611'
$env:F9_INJURY_CHANCE   = '0.9'    # 10% mirtis kiekvienam kritusiam unitui
$env:F9_TRUST_DECK      = '1'
$env:F9_ALLOW_REAL_DEATH= '1'      # 💀 saugiklis IŠJUNGTAS — tikri NFT gali mirti
$env:F9_DEPLOY_AUTH_MIN = '6'      # ✍️ be 6 parašų raidas neprasideda
$env:F9_BURN_URL        = 'http://127.0.0.1:8877/burn'
$env:F9_BURN_SECRET     = 'burn_local_2026'

Write-Host ""
Write-Host "💀 TIKRA MIRTIS ĮJUNGTA — tavo NFT gali sudegti negrįžtamai" -ForegroundColor Red
Write-Host "   žaidimas : http://localhost:8011/index.html?ep=ws://localhost:2611#f9home"
Write-Host "   deginimas: http://127.0.0.1:8877/"
Write-Host "   sustabdyti — Ctrl+C"
Write-Host ""

node node_modules\ts-node-dev\lib\bin.js --respawn --transpile-only src\index.ts
