# ✅ Netlify Environment Variable - Final Steps

## ✅ Kas Jau Gerai:

1. **Value laukas:** ✅ `https://de-fra-f8820c12.colyseus.cloud` - **TEISINGAI!**
2. **Scopes:** ✅ "All scopes" - **TEISINGAI!**
3. **Values:** ✅ "Same value for all deploy contexts" - **TEISINGAI!**

---

## ❌ Kas Reikia Pakeisti:

**Key laukas:** ❌ Dabar rodo `EXAMPLE_KEY` - **REIKIA PAKEISTI!**

---

## 🎯 Ką Daryti:

### Step 1: Pakeiskite Key Lauką

1. **Spustelėkite į "Key:" lauką**
2. **Ištrinkite:** `EXAMPLE_KEY`
3. **Įrašykite:** `VITE_COLYSEUS_ENDPOINT`

### Step 2: Patikrinkite Visą Formą

**Turėtų būti:**
- ✅ **Key:** `VITE_COLYSEUS_ENDPOINT`
- ✅ **Value:** `https://de-fra-f8820c12.colyseus.cloud`
- ✅ **Scopes:** "All scopes" (pasirinkta)
- ✅ **Values:** "Same value for all deploy contexts" (pasirinkta)
- ✅ **"Contains secret values"** - palikite nepažymėtą (checkbox)

### Step 3: Sukurkite Variable

1. **Spustelėkite:** **"Create variable"** (žalias mygtukas apačioje)
2. **Palaukite:** Kelių sekundžių
3. **Turėtų pasirodyti:** Patvirtinimas, kad variable sukurtas

---

## 🔍 Patikrinimas Po Sukūrimo

Po sukūrimo, turėtų pasirodyti:

1. **Sąraše environment variables:**
   - ✅ `VITE_COLYSEUS_ENDPOINT` su reikšme `https://de-fra-f8820c12.colyseus.cloud`
   - ✅ Rodo "All scopes"
   - ✅ Rodo "Same value in all deploy contexts"

2. **Redeploy Netlify:**
   - Eikite į **"Deploys"** sekciją
   - Spustelėkite **"Trigger deploy"** → **"Deploy site"**
   - Palaukite 2-5 min

---

## ✅ Final Checklist

- [ ] Key laukas = `VITE_COLYSEUS_ENDPOINT` (ne `EXAMPLE_KEY`)
- [ ] Value laukas = `https://de-fra-f8820c12.colyseus.cloud`
- [ ] Scopes = "All scopes" (pasirinkta)
- [ ] Values = "Same value for all deploy contexts" (pasirinkta)
- [ ] Spustelėta "Create variable"
- [ ] Variable sukurtas sėkmingai
- [ ] Netlify redeploy'intas

---

## 💡 Svarbiausia

**Key turi būti tiksliai:** `VITE_COLYSEUS_ENDPOINT`

**Neturėtų būti:**
- ❌ `EXAMPLE_KEY`
- ❌ `VITE_COLYSEUS_ENDPOINT ` (su tarpu)
- ❌ `vite_colyseus_endpoint` (mažosios raidės)

**Turėtų būti:**
- ✅ `VITE_COLYSEUS_ENDPOINT` (tiksliai taip)

---

**Dabar pakeiskite Key lauką į `VITE_COLYSEUS_ENDPOINT` ir spustelėkite "Create variable"!** 🚀

