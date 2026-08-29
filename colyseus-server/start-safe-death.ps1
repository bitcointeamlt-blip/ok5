# 🛡 LOKALUS SERVERIS SAUGIU REŽIMU
#
# Tas pats žaidimas ir ta pati 10% mirtis, bet tavo tokenId perrašomi +50000 (smėldėžė):
# miršta veidrodiniai unitai, TIKRI NFT nepaliečiami. Tinka mechanikai tikrinti be rizikos.
#
#   powershell -ExecutionPolicy Bypass -File start-safe-death.ps1

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

$busy = Get-NetTCPConnection -LocalPort 2611 -State Listen -ErrorAction SilentlyContinue
if ($busy) {
  Write-Host "❌ Portas 2611 jau užimtas (PID $($busy.OwningProcess))." -ForegroundColor Red
  Read-Host "`nEnter — išeiti"
  exit 1
}

$env:PORT             = '2611'
$env:F9_INJURY_CHANCE = '0.9'
$env:F9_TRUST_DECK    = '1'
$env:F9_SANDBOX_DECK  = '1'    # 🧪 tokenId +50000 — tikri NFT saugūs

Write-Host ""
Write-Host "🛡 SAUGUS REŽIMAS — tikri NFT nepaliečiami (miršta veidrodiniai)" -ForegroundColor Green
Write-Host "   žaidimas: http://localhost:8011/index.html?ep=ws://localhost:2611#f9home"
Write-Host "   sustabdyti — Ctrl+C"
Write-Host ""

node node_modules\ts-node-dev\lib\bin.js --respawn --transpile-only src\index.ts
