# 🔍 Netlify vs Colyseus Cloud Environment Variables

## ❌ Svarbus Skirtumas

**Nuotraukoje matosi:** Colyseus Cloud Dashboard → Environment Variables

**Bet reikia:** Netlify Dashboard → Environment Variables

---

## 📋 Dvi Skirtingos Vietos

### 1. Colyseus Cloud Environment Variables (Serverio Pusė)

**Kur:** https://cloud.colyseus.io → Jūsų aplikacija → Environment Variables

**Kam:** Colyseus serverio konfigūracijai (serverio pusė)

**Ką rodo nuotrauka:**
- ✅ `VITE_COLYSEUS_ENDPOINT` = `https://de-fra-f8820c12.colyseus.cloud`
- ✅ Tai yra teisingai nustatyta Colyseus Cloud'e

**Bet:** Tai nėra tai, ko reikia frontend'ui!

---

### 2. Netlify Environment Variables (Frontend Pusė)

**Kur:** https://app.netlify.com → Jūsų projektas → Site settings → Environment variables

**Kam:** Frontend aplikacijos konfigūracijai (Netlify build)

**Ką reikia pridėti:**
- ✅ `VITE_COLYSEUS_ENDPOINT` = `https://de-fra-f8820c12.colyseus.cloud`

**Tai yra tai, ko trūksta!**

---

## 🎯 Kodėl Reikia Abiejų?

### Colyseus Cloud Environment Variables:
- Naudojami Colyseus serverio konfigūracijai
- Serveris žino savo endpoint'ą
- Serveris žino, kur jis veikia

### Netlify Environment Variables:
- Naudojami frontend aplikacijos build'e
- Frontend žino, kur prisijungti prie Colyseus serverio
- Frontend build'as naudoja šiuos kintamuosius

---

## ✅ Ką Reikia Padaryti Dabar

### Step 1: Eikite į Netlify Dashboard

1. **Eikite į:** https://app.netlify.com
2. **Prisijunkite**
3. **Pasirinkite savo projektą** (pvz: `jocular-zabaione-835b49`)

### Step 2: Eikite į Environment Variables

1. **Kairėje meniu:** Spustelėkite **"Site settings"**
2. **Tada:** Spustelėkite **"Environment variables"**
3. **ARBA:** Spustelėkite **"Build & deploy"** → **"Environment"** → **"Environment variables"**

### Step 3: Pridėkite VITE_COLYSEUS_ENDPOINT

1. **Spustelėkite:** **"Add a variable"**
2. **Key:** `VITE_COLYSEUS_ENDPOINT`
3. **Value:** `https://de-fra-f8820c12.colyseus.cloud`
4. **Scope:** Pasirinkite **"All scopes"** arba **"Production"**
5. **Spustelėkite:** **"Save"**

### Step 4: Redeploy Netlify

1. **Eikite į:** **"Deploys"** sekciją
2. **Spustelėkite:** **"Trigger deploy"** → **"Deploy site"**
3. **Palaukite:** 2-5 min

---

## 🔍 Kaip Atpažinti Kur Esate?

### Colyseus Cloud Dashboard:
- URL: `https://cloud.colyseus.io`
- Kairėje meniu: "General", "Deployments", "Settings", "Environment Variables"
- Tamsus dizainas
- Rodo Colyseus serverio konfigūraciją

### Netlify Dashboard:
- URL: `https://app.netlify.com`
- Kairėje meniu: "Site settings", "Build & deploy", "Deploys"
- Šviesesnis dizainas
- Rodo frontend aplikacijos konfigūraciją

---

## 💡 Svarbiausia

**Colyseus Cloud Environment Variables ≠ Netlify Environment Variables**

**Reikia abiejų:**
- ✅ Colyseus Cloud → Serverio konfigūracija (jau yra)
- ✅ Netlify → Frontend konfigūracija (reikia pridėti)

---

**Dabar eikite į Netlify Dashboard ir pridėkite `VITE_COLYSEUS_ENDPOINT`!** 🚀

