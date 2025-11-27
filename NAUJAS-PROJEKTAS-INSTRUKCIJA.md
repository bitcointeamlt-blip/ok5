# 🆕 Naujas Projektas - Instrukcija

## ✅ Kas Reikia Padaryti

### Step 1: Sukurti Naują GitHub Repository

1. Eikite į GitHub: https://github.com/new
2. Repository name: `ok06` (arba kitas pavadinimas)
3. Pasirinkite: **Public** arba **Private**
4. **NE** pridėkite README, .gitignore, license
5. Spustelėkite **"Create repository"**

---

### Step 2: Nukopijuoti Kodą Lokaliai

**Windows PowerShell:**
```powershell
cd C:\Users\p3p3l\Downloads
Copy-Item -Path "pvp03" -Destination "pvp03-new" -Recurse
cd pvp03-new
```

**ARBA rankiniu būdu:**
- Nukopijuokite `pvp03` folderį
- Pervardykite į `pvp03-new`

---

### Step 3: Inicializuoti Git Naujame Folderyje

```powershell
cd C:\Users\p3p3l\Downloads\pvp03-new
git init
git add .
git commit -m "Initial commit - new Colyseus Cloud server"
git branch -M main
git remote add origin https://github.com/bitcointeamlt-blip/ok06.git
git push -u origin main
```

---

### Step 4: Pridėti SSH Deploy Key į GitHub

1. Eikite į GitHub: `https://github.com/bitcointeamlt-blip/ok06/settings/keys`
2. Spustelėkite **"Add deploy key"**
3. Title: `colyseus-cloud-deploy-key`
4. Key: Įklijuokite SSH key iš Colyseus Cloud:
   ```
   ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDSMkRrHeIfEXPIJGdxL/f5K3l1yUcQBBSp1uHsHquE/eeRt7/W5sFZit/Leu+VJ71GM+9XktdbyA76i4i28KXrU7hlkW8sH948a30JVZwacuggadnjt29UeB/RKiAo3FDpWiqBqy/eD1Y/OvEA2veajI1W/ja0NE/IlQu2Nk8JoTH7Gz2OV3uUAdIfZ2tzo7SX0Ir00JTrK94zCmo4/M2DYA1t8j7HXF5f5MtNE/3llvEvJisrgiUFm0Gcwqr4ZsUI2IKBwMD0p1hBBCDQP/thzurYySZdvRh2C7r7astXl6IlBkDZA2E+jmmJOJRwy0ziuXR5VAHEbn4Lts6fDSEL colyseus-cloud-deploy-key-16-11-2025
   ```
5. **Pažymėkite:** "Allow write access" (jei yra)
6. Spustelėkite **"Add key"**

---

### Step 5: Susieti su Colyseus Cloud

1. Colyseus Cloud Dashboard → **Settings** → **GitHub Connection**
2. Spustelėkite **"SELECT REPOSITORY"**
3. Pasirinkite: `bitcointeamlt-blip/ok06`
4. Patvirtinkite

---

### Step 6: Nustatyti Build Settings

Colyseus Cloud → **Settings** → **Build Configuration**:

- **Build Command:** `cd colyseus-server && npm install && npm run build`
- **Start Command:** `cd colyseus-server && npm start`
- **Root Directory:** `colyseus-server`
- **Node Version:** `22`

---

### Step 7: Deploy

1. Colyseus Cloud → **Deployments** tab
2. Spustelėkite **"Deploy"** arba **"New Deployment"**
3. Palaukite, kol deployment baigsis
4. Gausite naują endpoint (pvz: `https://naujas-xxxxx.colyseus.cloud`)

---

### Step 8: Atnaujinti Netlify

1. Netlify Dashboard → **Site settings** → **Environment variables**
2. Pakeiskite `VITE_COLYSEUS_ENDPOINT` į naują endpoint'ą
3. Redeploy site

---

## ⚠️ Svarbu

- ✅ **Senas ok05 projektas LIEKA NEPAKITAS**
- ✅ **Naujas ok06 projektas veikia nepriklausomai**
- ✅ **Galite turėti abu projektus vienu metu**

---

## 📋 Checklist

- [ ] Sukurtas naujas GitHub repository: `ok06`
- [ ] Nukopijuotas kodas lokaliai į `pvp03-new`
- [ ] Git inicializuotas naujame folderyje
- [ ] Kodas push'intas į `ok06`
- [ ] SSH deploy key pridėtas į `ok06`
- [ ] Colyseus Cloud susietas su `ok06`
- [ ] Build settings nustatyti
- [ ] Deployment sėkmingas
- [ ] Netlify environment variable atnaujintas

