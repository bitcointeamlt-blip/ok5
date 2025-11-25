# 📍 Netlify Environment Variables - Kur Rasti?

## ❌ Nuotraukoje Matosi: Project Policies (Netinkama Vieta)

**Kur esate:** Netlify → Project policies → Sensitive variable policy

**Kas tai:** Policy nustatymai, ne environment variables pridėjimui

**Ar reikia čia ką nors keisti?**
- ❌ **NE!** Čia nieko keisti nereikia.
- ✅ Palikite kaip yra: "Require approval" (default)

---

## ✅ Kur TIKRAI Reikia Eiti: Environment Variables

### Step 1: Eikite į Site Settings

1. **Kairėje meniu:** Spustelėkite **"Site settings"** (ne "Project policies")
2. **Tada:** Spustelėkite **"Environment variables"**

### Step 2: ARBA Eikite per Build & Deploy

1. **Kairėje meniu:** Spustelėkite **"Build & deploy"**
2. **Tada:** Spustelėkite **"Environment"**
3. **Tada:** Spustelėkite **"Environment variables"**

---

## 🎯 Kaip Atpažinti Teisingą Vietą?

### Teisinga vieta (Environment Variables):
- ✅ Rodo sąrašą environment variables (jei yra)
- ✅ Yra mygtukas **"Add a variable"** arba **"Add variable"**
- ✅ Yra formos laukai: "Key" ir "Value"
- ✅ Yra mygtukas **"Save"** arba **"Add variable"**

### Netinkama vieta (Project Policies):
- ❌ Rodo "Sensitive variable policy"
- ❌ Rodo radio button'us: "Require approval", "Deploy without sensitive variables", "Deploy without restrictions"
- ❌ Nėra formos laukų "Key" ir "Value"
- ❌ Nėra mygtuko "Add a variable"

---

## 📋 Tikslūs Žingsniai

### Option 1: Per Site Settings

1. **Kairėje meniu:** Spustelėkite **"Site settings"**
2. **Scroll down** arba spustelėkite **"Environment variables"** sekciją
3. **Spustelėkite:** **"Add a variable"**
4. **Key:** `VITE_COLYSEUS_ENDPOINT`
5. **Value:** `https://de-fra-f8820c12.colyseus.cloud`
6. **Scope:** Pasirinkite **"All scopes"** arba **"Production"**
7. **Spustelėkite:** **"Save"**

### Option 2: Per Build & Deploy

1. **Kairėje meniu:** Spustelėkite **"Build & deploy"**
2. **Spustelėkite:** **"Environment"** (submenu)
3. **Spustelėkite:** **"Environment variables"**
4. **Spustelėkite:** **"Add a variable"**
5. **Key:** `VITE_COLYSEUS_ENDPOINT`
6. **Value:** `https://de-fra-f8820c12.colyseus.cloud`
7. **Scope:** Pasirinkite **"All scopes"** arba **"Production"**
8. **Spustelėkite:** **"Save"**

---

## 🔍 Ką Daryti Su Project Policies?

**Project policies → Sensitive variable policy:**
- ✅ Palikite kaip yra: **"Require approval"** (default)
- ✅ Tai yra saugumo nustatymas
- ✅ Neturėtų trukdyti environment variables pridėjimui

**Jei norite pakeisti:**
- **"Require approval"** - saugiausias (rekomenduojama)
- **"Deploy without sensitive variables"** - automatiškai deploy, bet be sensitive variables
- **"Deploy without restrictions"** - visi deploy'ai su visais variables (ne saugu)

**Bet:** Dabar nieko keisti nereikia, palikite "Require approval".

---

## 💡 Svarbiausia

**Project policies ≠ Environment variables**

**Project policies:**
- Policy nustatymai
- Saugumo nustatymai
- Neturėtų trukdyti environment variables pridėjimui

**Environment variables:**
- Kintamųjų pridėjimas
- Build konfigūracija
- Tai yra tai, ko reikia!

---

**Dabar eikite į "Site settings" → "Environment variables" (ne "Project policies")!** 🚀

