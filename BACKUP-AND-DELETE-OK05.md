# 💾 Backup ir Ištrynimas OK05 Folderio

## 🔍 Patikrinkite Kur Yra OK05 Folderis

**Galimos vietos:**
- `C:\Users\p3p3l\Downloads\ok05`
- `C:\Users\p3p3l\Documents\GitHub\ok05`
- `C:\Users\p3p3l\Desktop\ok05`
- Arba kitas folderis

---

## ✅ Step 1: Raskite OK05 Folderį

**PowerShell:**
```powershell
Get-ChildItem -Path C:\Users\p3p3l -Recurse -Directory -Filter "ok05" -ErrorAction SilentlyContinue | Select-Object FullName
```

**ARBA File Explorer:**
- Ieškokite `ok05` folderio rankiniu būdu

---

## ✅ Step 2: Patikrinkite Kas Blokuoja Ištrynimą

### A. Patikrinkite Ar Folderis Atidarytas

**File Explorer:**
- Uždarykite visus File Explorer langus su `ok05` folderiu
- Uždarykite VS Code arba kitą IDE, jei atidarytas `ok05` folderis

### B. Patikrinkite Ar Yra Procesų

**PowerShell:**
```powershell
Get-Process | Where-Object {$_.Path -like "*ok05*"}
```

**Jei yra procesų:**
- Uždarykite juos (Task Manager → End Task)

### C. Patikrinkite Ar Yra Git Lock

**PowerShell:**
```powershell
Get-ChildItem -Path "C:\Users\p3p3l\Downloads\ok05\.git" -Recurse -Filter "*.lock" -ErrorAction SilentlyContinue
```

**Jei yra `.lock` failų:**
- Ištrinkite juos:
```powershell
Remove-Item -Path "C:\Users\p3p3l\Downloads\ok05\.git\*.lock" -Force
```

---

## ✅ Step 3: Padarykite Backup

### Option A: Kopijuokite Folderį

**PowerShell:**
```powershell
# Nustatykite teisingą path
$sourcePath = "C:\Users\p3p3l\Downloads\ok05"
$backupPath = "C:\Users\p3p3l\Downloads\ok05-backup-$(Get-Date -Format 'yyyy-MM-dd-HHmmss')"

# Kopijuokite folderį
Copy-Item -Path $sourcePath -Destination $backupPath -Recurse -Force
```

**ARBA File Explorer:**
1. Dešiniuoju pelės mygtuku ant `ok05` folderio
2. **Copy**
3. Dešiniuoju pelės mygtuku → **Paste**
4. Pervadinkite į `ok05-backup-2025-11-26`

### Option B: Zip Backup

**PowerShell:**
```powershell
# Nustatykite teisingą path
$sourcePath = "C:\Users\p3p3l\Downloads\ok05"
$zipPath = "C:\Users\p3p3l\Downloads\ok05-backup-$(Get-Date -Format 'yyyy-MM-dd-HHmmss').zip"

# Sukurkite zip
Compress-Archive -Path $sourcePath -DestinationPath $zipPath -Force
```

---

## ✅ Step 4: Ištrinkite OK05 Folderį

### Option A: PowerShell (Jei Nėra Klaidų)

**PowerShell:**
```powershell
# Nustatykite teisingą path
$folderPath = "C:\Users\p3p3l\Downloads\ok05"

# Ištrinkite folderį
Remove-Item -Path $folderPath -Recurse -Force
```

### Option B: File Explorer (Jei PowerShell Neveikia)

1. Atidarykite **File Explorer**
2. Eikite į `ok05` folderį
3. Dešiniuoju pelės mygtuku ant `ok05` folderio
4. **Delete** (arba **Shift + Delete** - permanent delete)
5. Jei gaunate klaidą:
   - Uždarykite visus langus
   - Restart'inkite File Explorer (Task Manager → Windows Explorer → Restart)
   - Bandykite dar kartą

### Option C: Unlocker (Jei Vis Dar Neveikia)

**Jei vis dar gaunate klaidas:**
1. Atsisiųskite **Unlocker** arba **IObit Unlocker**
2. Dešiniuoju pelės mygtuku ant `ok05` folderio
3. **Unlocker** → **Unlock All** → **Delete**

---

## 🔍 Troubleshooting

### Klaida: "Folder is in use"

**Sprendimas:**
1. Uždarykite visus langus su `ok05` folderiu
2. Uždarykite VS Code / IDE
3. Uždarykite GitHub Desktop (jei atidarytas)
4. Restart'inkite File Explorer
5. Bandykite dar kartą

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

# Tada bandykite ištrinti folderį
Remove-Item -Path "C:\Users\p3p3l\Downloads\ok05" -Recurse -Force
```

---

## 📋 Checklist

### Prieš Ištrynimą:
- [ ] ✅ Rastas `ok05` folderis
- [ ] ✅ Padarytas backup (kopija arba zip)
- [ ] ✅ Uždaryti visi langai su `ok05` folderiu
- [ ] ✅ Uždarytas VS Code / IDE
- [ ] ✅ Uždarytas GitHub Desktop
- [ ] ✅ Patikrinta ar nėra procesų

### Po Backup:
- [ ] ✅ Backup sukurtas (`ok05-backup-...`)
- [ ] ✅ Patikrinta ar backup veikia
- [ ] ✅ Galite saugiai ištrinti originalų `ok05` folderį

---

## 🎯 Išvada

**Dabar galite:**
1. Padaryti backup `ok05` folderio
2. Saugiai ištrinti originalų `ok05` folderį
3. Jei reikės, atkurti iš backup

**Po backup galite saugiai ištrinti!** 🚀




