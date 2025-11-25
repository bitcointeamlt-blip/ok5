# 🔐 GitHub Autentifikacijos Gavyba

## 🎯 Du Būdai: Personal Access Token (PAT) arba SSH Key

---

## ✅ Būdas 1: Personal Access Token (PAT) - REKOMENDUOJAMA

### 1. Sukurkite GitHub Personal Access Token

1. **Eikite į GitHub:**
   - Prisijunkite: https://github.com
   - Spustelėkite savo profilį (viršuje dešinėje)
   - Settings → Developer settings → Personal access tokens → Tokens (classic)

2. **Sukurkite naują token'ą:**
   - Spustelėkite **"Generate new token"** → **"Generate new token (classic)"**
   - **Note:** Įrašykite: `DOT Clicker Project`
   - **Expiration:** Pasirinkite (pvz., 90 dienų arba No expiration)
   - **Scopes:** Pažymėkite:
     - ✅ `repo` (Full control of private repositories)
     - ✅ `workflow` (Update GitHub Action workflows)

3. **Nukopijuokite token'ą:**
   - ⚠️ **SVARBU:** Token'as bus rodomas TIK VIENĄ KARTĄ!
   - Nukopijuokite jį ir išsaugokite saugioje vietoje
   - Formatas: `ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

---

### 2. Naudokite Token'ą su Git

#### Jei naudojate Git komandas:

```powershell
# Nustatyti token'ą kaip credential
git config --global credential.helper store

# Pirmą kartą push'inti, įveskite:
# Username: jūsų-github-username
# Password: ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx (token'as)
```

#### Arba naudokite URL su token'u:

```powershell
git remote set-url origin https://ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx@github.com/jusu-username/ok06.git
```

---

### 3. Naudokite Token'ą su GitHub Desktop

GitHub Desktop automatiškai naudoja jūsų GitHub account'ą - nereikia token'o!

---

## ✅ Būdas 2: SSH Key - Saugiau, bet sudėtingiau

### 1. Sukurkite SSH Key

#### Windows (PowerShell):

```powershell
# Sukurti SSH key
ssh-keygen -t ed25519 -C "jūsų@email.com"

# Pasirinkite vietą (arba Enter - naudos numatytą)
# Įveskite passphrase (arba palikite tuščią)

# Rodyti public key
cat ~/.ssh/id_ed25519.pub
```

Arba jei naudojate Git Bash:

```bash
ssh-keygen -t ed25519 -C "jūsų@email.com"
cat ~/.ssh/id_ed25519.pub
```

---

### 2. Pridėkite SSH Key į GitHub

1. **Nukopijuokite public key:**
   - Atidarykite: `C:\Users\p3p3l\.ssh\id_ed25519.pub`
   - Nukopijuokite visą turinį

2. **Pridėkite į GitHub:**
   - GitHub → Settings → SSH and GPG keys
   - Spustelėkite **"New SSH key"**
   - **Title:** `DOT Clicker Project`
   - **Key:** Įklijuokite nukopijuotą public key
   - Spustelėkite **"Add SSH key"**

---

### 3. Naudokite SSH su Git

```powershell
# Pakeisti remote URL į SSH
git remote set-url origin git@github.com:jusu-username/ok06.git

# Testuoti SSH connection
ssh -T git@github.com
```

---

## 🚀 Greitas Commit'as su Token'u

### Jei turite Git įdiegtą:

```powershell
# 1. Inicializuoti repository (jei reikia)
git init

# 2. Pridėti remote su token'u
git remote add origin https://ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx@github.com/jusu-username/ok06.git

# 3. Pridėti failus
git add .

# 4. Commit'inti
git commit -m "Fix: Colyseus CORS - HTTP server request listener for matchmaking endpoints"

# 5. Push'inti
git push -u origin main
```

---

## 💡 Rekomendacija

**Naudokite GitHub Desktop** - jis automatiškai:
- ✅ Tvarko autentifikaciją
- ✅ Nereikia token'o arba SSH key
- ✅ Lengviau naudoti
- ✅ Automatiškai commit'ina ir push'ina

**Arba naudokite Personal Access Token** su Git komandomis.

---

## 📋 Ką Daryti Dabar

### Option 1: GitHub Desktop (Lengviausia)

1. Įdiekite: https://desktop.github.com/
2. Prisijunkite su GitHub account'u
3. Atidarykite repository
4. Commit'inkite ir push'inkite

### Option 2: Personal Access Token

1. Sukurkite token'ą (instrukcijos aukščiau)
2. Įdiekite Git: https://git-scm.com/download/win
3. Naudokite token'ą su Git komandomis

### Option 3: SSH Key

1. Sukurkite SSH key (instrukcijos aukščiau)
2. Pridėkite į GitHub
3. Naudokite SSH su Git

---

## ❓ Kur Rasti Token'ą arba SSH Key?

### Personal Access Token:
- GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
- Sukurkite naują token'ą

### SSH Key:
- Windows: `C:\Users\p3p3l\.ssh\id_ed25519.pub` (public key)
- Windows: `C:\Users\p3p3l\.ssh\id_ed25519` (private key - NESIDALINKITE!)

---

## ⚠️ Saugumas

- ❌ **NIEKADA** nedalinkite private SSH key
- ❌ **NIEKADA** nedalinkite token'o publikoje vietoje
- ✅ Naudokite token'ą tik savo kompiuteryje
- ✅ Jei token'as nutekėjo - iš karto ištrinkite jį GitHub'e

---

## 🎯 Kitas Žingsnis

Pasirinkite vieną būdą ir sekite instrukcijas. Rekomenduoju **GitHub Desktop** - tai lengviausias būdas!





