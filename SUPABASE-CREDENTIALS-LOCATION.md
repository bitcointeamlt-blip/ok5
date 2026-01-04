# 🔍 Kur Rasti Supabase Credentials

## 📍 Kaip Rasti Supabase URL ir Anon Key

### Step 1: Eikite į Settings → API

**Supabase Dashboard:**
1. Kairėje pusėje (sidebar) spustelėkite **"Settings"** (paskutinė ikona apačioje - gear icon)
2. Tada spustelėkite **"API"** iš settings meniu

**ARBA:**
- Spustelėkite **"Settings"** iš top bar (dešinėje pusėje, prie "Connect" mygtuko)
- Tada pasirinkite **"API"** sekciją

---

### Step 2: Raskite Project URL ir API Keys

**API Settings puslapyje rasite:**

#### 1. Project URL:
- **Label:** "Project URL" arba "API URL"
- **Format:** `https://xxxxx.supabase.co`
- **Tai yra:** `VITE_SUPABASE_URL`

#### 2. Project API keys:
- **anon/public key** - tai yra `VITE_SUPABASE_ANON_KEY`
- **service_role key** - NENAUDOKITE šio (tik server-side)

---

## 📋 Kaip Kopijuoti

### Project URL:
1. Spustelėkite **"Copy"** mygtuką prie Project URL
2. ARBA pažymėkite tekstą ir Ctrl+C

### Anon Key:
1. Spustelėkite **"Copy"** mygtuką prie "anon public" key
2. ARBA pažymėkite tekstą ir Ctrl+C
3. **SVARBU:** Naudokite **anon/public** key, NE service_role!

---

## ✅ Po Kopijavimo

### Pridėkite į Netlify:

1. **Netlify Dashboard** → Site settings → Environment variables
2. Spustelėkite **"Add a variable"** (dešinėje viršuje)
3. Pridėkite:
   - **Key:** `VITE_SUPABASE_URL`
   - **Value:** jūsų Project URL (pvz: `https://xxxxx.supabase.co`)
4. Spustelėkite **"Add a variable"** dar kartą
5. Pridėkite:
   - **Key:** `VITE_SUPABASE_ANON_KEY`
   - **Value:** jūsų anon public key

---

## 🎯 Quick Path

**Supabase Dashboard:**
```
Settings (gear icon) → API → Project URL + anon public key
```

**Netlify Dashboard:**
```
Site settings → Environment variables → Add a variable
```

---

## ⚠️ SVARBU

- ✅ Naudokite **anon/public** key (ne service_role!)
- ✅ Project URL format: `https://xxxxx.supabase.co`
- ✅ Po pridėjimo → Redeploy frontend!
























