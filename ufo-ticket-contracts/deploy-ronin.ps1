$ErrorActionPreference = "Stop"

Write-Host "== PewPew UFO Ticket deploy (Ronin mainnet) ==" -ForegroundColor Cyan
Write-Host "This will deploy a NEW contract address."
Write-Host "Requirements: ufo-ticket-contracts/.env with DEPLOYER_PRIVATE_KEY, RONKE_TOKEN_ADDRESS, FEE_RECIPIENT_ADDRESS"
Write-Host ""

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

if (-not (Test-Path ".env")) {
  Write-Host "ERROR: Missing .env in ufo-ticket-contracts/." -ForegroundColor Red
  Write-Host "Copy ENV_EXAMPLE.txt -> .env and fill it first."
  exit 1
}

Write-Host "Installing deps (if needed)..." -ForegroundColor Gray
npm install | Out-Host

Write-Host "Deploying to Ronin mainnet..." -ForegroundColor Yellow
npm run deploy:ronin | Out-Host

Write-Host ""
Write-Host "Done. Copy the printed 'UfoTicket deployed at: 0x...' address into:" -ForegroundColor Green
Write-Host " - Colyseus server env: UFO_TICKET_CONTRACT_ADDRESS"
Write-Host " - Frontend env: VITE_UFO_TICKET_CONTRACT_ADDRESS"


