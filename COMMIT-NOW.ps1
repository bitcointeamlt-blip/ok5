# Commit ir Push su GitHub API
# Reikia: GitHub Personal Access Token

$token = "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"
$repo = "ok06"
$owner = "p3p3l"  # Pakeiskite į savo GitHub username

# Patikrinkite, ar yra .git folder
if (-not (Test-Path ".git")) {
    Write-Host "❌ .git folder nerastas. Reikia git init"
    exit 1
}

# Bandykite naudoti git, jei yra
$gitPath = Get-Command git -ErrorAction SilentlyContinue
if ($gitPath) {
    Write-Host "✅ Git rastas, darau commit..."
    
    git add .
    git commit -m "Simplify Colyseus server - minimal setup per official recommendations"
    git push
    
    Write-Host "✅ Commit ir push sėkmingi!"
} else {
    Write-Host "❌ Git nerastas. Naudokite GitHub Desktop:"
    Write-Host "1. Atidarykite GitHub Desktop"
    Write-Host "2. Select all files"
    Write-Host "3. Commit message: 'Simplify Colyseus server - minimal setup per official recommendations'"
    Write-Host "4. Push"
}





