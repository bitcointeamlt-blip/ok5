# PowerShell Script: Patikrinti GitHub Ryšį
# Naudojimas: .\check-github-connection.ps1

Write-Host "🔍 Tikrinamas GitHub ryšys..." -ForegroundColor Cyan
Write-Host ""

# 1. Patikrinti, ar Git įdiegtas
Write-Host "1️⃣ Tikrinama, ar Git įdiegtas..." -ForegroundColor Yellow
try {
    $gitVersion = git --version 2>&1
    Write-Host "   ✅ Git rastas: $gitVersion" -ForegroundColor Green
    $gitInstalled = $true
} catch {
    Write-Host "   ❌ Git NERASTAS!" -ForegroundColor Red
    Write-Host "   💡 Įdiekite Git iš: https://git-scm.com/download/win" -ForegroundColor Yellow
    Write-Host "   💡 Arba naudokite GitHub Desktop: https://desktop.github.com/" -ForegroundColor Yellow
    $gitInstalled = $false
}

if (-not $gitInstalled) {
    Write-Host ""
    Write-Host "⚠️  Negaliu patikrinti GitHub ryšio be Git įrankio" -ForegroundColor Yellow
    Write-Host "💡 Rekomendacija: Naudokite GitHub Desktop - jis automatiškai tvarko viską" -ForegroundColor Cyan
    exit 0
}

Write-Host ""

# 2. Patikrinti, ar yra Git repository
Write-Host "2️⃣ Tikrinama, ar yra Git repository..." -ForegroundColor Yellow
if (Test-Path ".git") {
    Write-Host "   ✅ Git repository rastas (.git folder egzistuoja)" -ForegroundColor Green
    $hasRepo = $true
} else {
    Write-Host "   ❌ Git repository NERASTAS!" -ForegroundColor Red
    Write-Host "   💡 Reikia inicializuoti: git init" -ForegroundColor Yellow
    $hasRepo = $false
}

Write-Host ""

# 3. Patikrinti Git konfigūraciją
Write-Host "3️⃣ Tikrinama Git konfigūracija..." -ForegroundColor Yellow
if ($hasRepo) {
    $userName = git config --get user.name 2>&1
    $userEmail = git config --get user.email 2>&1
    
    if ($userName -and -not $userName.Contains("error")) {
        Write-Host "   ✅ Vartotojo vardas: $userName" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Vartotojo vardas nenustatytas" -ForegroundColor Yellow
        Write-Host "   💡 Nustatykite: git config --global user.name 'Jūsų Vardas'" -ForegroundColor Cyan
    }
    
    if ($userEmail -and -not $userEmail.Contains("error")) {
        Write-Host "   ✅ Vartotojo email: $userEmail" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Vartotojo email nenustatytas" -ForegroundColor Yellow
        Write-Host "   💡 Nustatykite: git config --global user.email 'jūsų@email.com'" -ForegroundColor Cyan
    }
} else {
    Write-Host "   ⚠️  Negaliu patikrinti - nėra Git repository" -ForegroundColor Yellow
}

Write-Host ""

# 4. Patikrinti remote repository
Write-Host "4️⃣ Tikrinama remote repository (GitHub)..." -ForegroundColor Yellow
if ($hasRepo) {
    $remoteUrl = git config --get remote.origin.url 2>&1
    
    if ($remoteUrl -and -not $remoteUrl.Contains("error")) {
        Write-Host "   ✅ Remote repository rastas: $remoteUrl" -ForegroundColor Green
        
        # Patikrinti, ar tai GitHub
        if ($remoteUrl -match "github.com") {
            Write-Host "   ✅ Tai GitHub repository!" -ForegroundColor Green
            
            # Ištraukti repository vardą
            if ($remoteUrl -match "github.com[:/](.+?)/(.+?)(?:\.git)?$") {
                $username = $Matches[1]
                $repo = $Matches[2]
                Write-Host "   Repository: $username/$repo" -ForegroundColor Cyan
            }
        } else {
            Write-Host "   Tai ne GitHub repository" -ForegroundColor Yellow
        }
        
        # Patikrinti branch'ą
        $currentBranch = git branch --show-current 2>&1
        if ($currentBranch -and -not $currentBranch.Contains("error")) {
            Write-Host "   Dabartinis branch: $currentBranch" -ForegroundColor Cyan
        }
        
        $hasRemote = $true
    } else {
        Write-Host "   Remote repository NERASTAS!" -ForegroundColor Red
        Write-Host "   Pridėkite: git remote add origin https://github.com/jusu-username/ok06.git" -ForegroundColor Yellow
        $hasRemote = $false
    }
} else {
    Write-Host "   Negaliu patikrinti - nėra Git repository" -ForegroundColor Yellow
    $hasRemote = $false
}

Write-Host ""

# 5. Patikrinti pakeitimus
Write-Host "5️⃣ Tikrinami pakeitimai..." -ForegroundColor Yellow
if ($hasRepo) {
    $status = git status --porcelain 2>&1
    if ($status -and -not $status.Contains("error")) {
        $changedFiles = ($status -split "`n" | Where-Object { $_ -ne "" }).Count
        if ($changedFiles -gt 0) {
            Write-Host "   ⚠️  Rasta $changedFiles pakeitimų, kurie nėra commit'inti" -ForegroundColor Yellow
            Write-Host "   📋 Pakeitimai:" -ForegroundColor Cyan
            git status --short 2>&1 | ForEach-Object { Write-Host "      $_" -ForegroundColor Gray }
        } else {
            Write-Host "   ✅ Nėra necommit'intų pakeitimų" -ForegroundColor Green
        }
    }
}

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

# Galutinė išvada
if ($gitInstalled -and $hasRepo -and $hasRemote) {
    Write-Host "✅ GitHub RYŠYS VEIKIA!" -ForegroundColor Green
    Write-Host ""
    Write-Host "💡 Galite commit'inti kodą:" -ForegroundColor Cyan
    Write-Host "   .\commit-to-github.ps1" -ForegroundColor Yellow
    Write-Host "   Arba naudokite GitHub Desktop" -ForegroundColor Yellow
} elseif ($gitInstalled -and $hasRepo -and -not $hasRemote) {
    Write-Host "⚠️  Git veikia, bet nėra GitHub remote repository" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "💡 Pridėkite GitHub remote:" -ForegroundColor Cyan
    Write-Host "   git remote add origin https://github.com/jūsų-username/ok06.git" -ForegroundColor Yellow
} elseif ($gitInstalled -and -not $hasRepo) {
    Write-Host "⚠️  Git veikia, bet nėra Git repository" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "💡 Inicializuokite repository:" -ForegroundColor Cyan
    Write-Host "   git init" -ForegroundColor Yellow
    Write-Host "   git remote add origin https://github.com/jūsų-username/ok06.git" -ForegroundColor Yellow
} else {
    Write-Host "❌ GitHub RYŠYS NEVEIKIA" -ForegroundColor Red
    Write-Host ""
    Write-Host "Rekomendacija: Naudokite GitHub Desktop" -ForegroundColor Cyan
    Write-Host "   https://desktop.github.com/" -ForegroundColor Yellow
    Write-Host "   Jis automatiskai tvarko viska" -ForegroundColor Yellow
}

Write-Host ""

