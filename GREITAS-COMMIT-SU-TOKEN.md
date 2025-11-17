# 🚀 Greitas Commit su GitHub Token

## 📋 Kaip Naudoti

### 1. Gaukite GitHub Token'ą

1. Eikite į: https://github.com/settings/tokens
2. Spustelėkite **"Generate new token"** → **"Generate new token (classic)"**
3. Pažymėkite `repo` scope
4. Nukopijuokite token'ą (formatas: `ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`)

---

### 2. Paleiskite Script'ą

```powershell
.\commit-with-token.ps1 -GitHubToken "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" -GitHubUsername "jusu-username"
```

Arba be parametrų (script'as paklaus):

```powershell
.\commit-with-token.ps1 -GitHubToken "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

---

## ✅ Kas Atsitiks

Script'as automatiškai:
1. ✅ Patikrina Git konfigūraciją
2. ✅ Inicializuoja repository (jei reikia)
3. ✅ Nustato remote su token'u
4. ✅ Prideda visus failus
5. ✅ Commit'ina su žinute
6. ✅ Push'ina į GitHub

---

## 🔐 Saugumas

- ⚠️ Token'as bus matomas PowerShell history
- ✅ Po commit'o galite ištrinti token'ą iš GitHub
- ✅ Arba naudokite GitHub Desktop - saugiau

---

## 💡 Alternatyva: GitHub Desktop

Jei nenorite naudoti token'o, naudokite **GitHub Desktop**:
- https://desktop.github.com/
- Automatiškai tvarko autentifikaciją
- Nereikia token'o



