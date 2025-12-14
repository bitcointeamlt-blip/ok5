# 💾 OK05 Backup ir Ištrynimas - Instrukcijos

## 🚀 Greitas Būdas (PowerShell Script'ai)

### Step 1: Padarykite Backup

**PowerShell (kaip Administrator):**
```powershell
cd C:\Users\p3p3l\Downloads\pvp03-new
.\find-and-backup-ok05.ps1
```

**Script'as:**
- ✅ Randa visus `ok05` ir `ok5` folderius
- ✅ Padaro backup (kopija arba ZIP)
- ✅ Rodo backup path

---

### Step 2: Ištrinkite OK05 Folderį

**PowerShell (kaip Administrator):**
```powershell
cd C:\Users\p3p3l\Downloads\pvp03-new
.\delete-ok05-safe.ps1
```

**Script'as:**
- ✅ Randa `ok05` folderius
- ✅ Patikrina ar padarytas backup
- ✅ Saugiai ištrina folderius

---

## 📋 Rankinis Būdas

### Step 1: Raskite OK05 Folderį

**Galimos vietos:**
- `C:\Users\p3p3l\Downloads\ok05`
- `C:\Users\p3p3l\Documents\GitHub\ok05`
- `C:\Users\p3p3l\Desktop\ok05`

**PowerShell:**
```powershell
Get-ChildItem -Path C:\Users\p3p3l -Recurse -Directory -Filter "ok05" -ErrorAction SilentlyContinue | Select-Object FullName
```

---

### Step 2: Padarykite Backup

**Option A: Kopijuokite Folderį**

1. Atidarykite **File Explorer**
2. Raskite `ok05` folderį
3. Dešiniuoju pelės mygtuku → **Copy**
4. Dešiniuoju pelės mygtuku → **Paste**
5. Pervadinkite į `ok05-backup-2025-11-26`

**Option B: Zip Backup**

**PowerShell:**
```powershell
$sourcePath = "C:\Users\p3p3l\Downloads\ok05"
$zipPath = "C:\Users\p3p3l\Downloads\ok05-backup-$(Get-Date -Format 'yyyy-MM-dd-HHmmss').zip"
Compress-Archive -Path $sourcePath -DestinationPath $zipPath -Force
```

---

### Step 3: Uždarykite Visus Langus

**SVARBU prieš trinant:**
- ✅ Uždarykite visus File Explorer langus su `ok05` folderiu
- ✅ Uždarykite VS Code / IDE (jei atidarytas `ok05`)
- ✅ Uždarykite GitHub Desktop (jei atidarytas `ok05`)

---

### Step 4: Ištrinkite OK05 Folderį

**Option A: File Explorer**

1. Dešiniuoju pelės mygtuku ant `ok05` folderio
2. **Delete** (arba **Shift + Delete** - permanent delete)

**Option B: PowerShell**

```powershell
# Ištrinkite Git lock failus pirmiausia
Remove-Item -Path "C:\Users\p3p3l\Downloads\ok05\.git\*.lock" -Force -ErrorAction SilentlyContinue

# Ištrinkite folderį
Remove-Item -Path "C:\Users\p3p3l\Downloads\ok05" -Recurse -Force
```

**Option C: PowerShell kaip Administrator**

```powershell
# Atidarykite PowerShell kaip Administrator
Start-Process powershell -Verb RunAs

# Tada vykdykite:
Remove-Item -Path "C:\Users\p3p3l\Downloads\ok05" -Recurse -Force
```

---

## 🔍 Troubleshooting

### Klaida: "Folder is in use"

**Sprendimas:**
1. Uždarykite visus langus
2. Restart'inkite File Explorer:
   - Task Manager → Windows Explorer → Restart
3. Bandykite dar kartą

### Klaida: "Access Denied"

**Sprendimas:**
1. Atidarykite PowerShell kaip **Administrator**
2. Bandykite ištrinti:
```powershell
Remove-Item -Path "C:\Users\p3p3l\Downloads\ok05" -Recurse -Force
```

### Klaida: "Git lock"

**Sprendimas:**
```powershell
# Ištrinkite Git lock failus
Remove-Item -Path "C:\Users\p3p3l\Downloads\ok05\.git\*.lock" -Force -ErrorAction SilentlyContinue

# Tada bandykite ištrinti
Remove-Item -Path "C:\Users\p3p3l\Downloads\ok05" -Recurse -Force
```

---

## 📋 Checklist

### Prieš Ištrynimą:
- [ ] ✅ Rastas `ok05` folderis
- [ ] ✅ Padarytas backup (kopija arba ZIP)
- [ ] ✅ Patikrinta ar backup veikia
- [ ] ✅ Uždaryti visi langai
- [ ] ✅ Uždarytas VS Code / IDE
- [ ] ✅ Uždarytas GitHub Desktop

### Po Backup:
- [ ] ✅ Backup sukurtas
- [ ] ✅ Galite saugiai ištrinti originalų folderį

---

## 🎯 Išvada

**Dabar galite:**
1. Padaryti backup naudojant script'ą arba rankiniu būdu
2. Saugiai ištrinti `ok05` folderį
3. Jei reikės, atkurti iš backup

**Script'ai paruošti ir paruošti naudoti!** 🚀








