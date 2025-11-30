# 🚀 Jetpack Garso Efektas - Tikras Jetpack Garsas

## ✅ Kas pakeista:

Jetpack garso efektas pakeistas į tikrą jetpack/reaktyvinio variklio garsą su trimis osciliatoriais.

### Pakeitimai:

1. **Low frequency rumble (engine base):**
   - **Frequency:** 80→150 Hz (pagal degalų kiekį)
   - **Type:** Sawtooth wave (engine rumble)
   - **Efektas:** Tarsi reaktyvinio variklio bazės garsas

2. **Mid frequency whoosh (thrust):**
   - **Frequency:** 300→500 Hz (pagal degalų kiekį)
   - **Type:** Sawtooth wave (thrust sound)
   - **Efektas:** Tarsi jetpack thrust/whoosh garsas

3. **High frequency air flow (air rushing):**
   - **Frequency:** 800→1200 Hz (pagal degalų kiekį)
   - **Type:** Sine wave (smooth air flow)
   - **Efektas:** Tarsi oro srautas (air rushing)

4. **Low-pass filter:**
   - **Cutoff:** 3000 Hz (warmer, more engine-like)
   - **Q:** 0.7 (softer filter)
   - **Efektas:** Sukuria tikrą jetpack/reaktyvinio variklio atmosferą

## 🎮 Kaip veikia dabar:

1. **Aktyvavimas:**
   - Paspaudžiate ir laikote SPACE
   - Jetpack aktyvuojamas
   - Prasideda tikras jetpack garsas (engine rumble + thrust + air flow)

2. **Naudojimas:**
   - Garso efektas tęsiasi tol kol naudojami degalai
   - Garso efektas stiprėja pagal degalų kiekį:
     - Kuo mažiau degalų, tuo aukštesnis tonas (visi osciliatoriai)
     - Kuo mažiau degalų, tuo garsesnis (12%→28% volume)
   - Garso efektas atnaujinamas kiekviename frame'e

3. **Deaktyvavimas:**
   - Paleidžiate SPACE
   - Jetpack deaktyvuojamas
   - Garso efektas sustabdomas (smooth fade out, 0.15s)

## 🔧 Techniniai detalės:

### Garso parametrai:

**Low frequency rumble (engine base):**
- **Frequency:** 80→150 Hz (pagal degalų kiekį)
- **Type:** Sawtooth wave
- **Efektas:** Reaktyvinio variklio bazės garsas

**Mid frequency whoosh (thrust):**
- **Frequency:** 300→500 Hz (pagal degalų kiekį)
- **Type:** Sawtooth wave
- **Efektas:** Jetpack thrust/whoosh garsas

**High frequency air flow (air rushing):**
- **Frequency:** 800→1200 Hz (pagal degalų kiekį)
- **Type:** Sine wave
- **Efektas:** Oro srautas (air rushing)

**Low-pass filter:**
- **Cutoff:** 3000 Hz
- **Q:** 0.7 (softer)
- **Efektas:** Warmer, more engine-like sound

**Volume:**
- **Base:** 12% (pradžioje)
- **Max:** 28% (prieš perdegimą)
- **Stiprėja:** Kuo mažiau degalų, tuo garsesnis

## 📊 Palyginimas:

| Parametras | Prieš (Energija) | Dabar (Jetpack) |
|------------|------------------|------------------|
| Low Frequency | 400→600 Hz | 80→150 Hz |
| Mid Frequency | 1200→1800 Hz | 300→500 Hz |
| High Frequency | Nėra | 800→1200 Hz |
| Type | Sawtooth + Square | Sawtooth + Sawtooth + Sine |
| Filter | 2000 Hz | 3000 Hz |
| Volume | 10%→22% | 12%→28% |
| Efektas | Energija | Tikras jetpack |

## ✅ Testavimas:

1. Paleiskite žaidimą lokaliame režime
2. Perjunkite į PvP arba Training mode
3. Paspaudžiate ir laikote SPACE
4. Turėtumėte išgirsti:
   - **Tikrą jetpack garsą** (reaktyvinio variklio garsas)
   - **Engine rumble** (žemas tonas, 80→150 Hz)
   - **Thrust whoosh** (vidutinis tonas, 300→500 Hz)
   - **Air flow** (aukštas tonas, 800→1200 Hz)
   - Garso efektas stiprėja kai degalai mažėja
   - Aukštesnis tonas ir garsesnis kai degalai artėja prie 0%
5. Paleidžiate SPACE
6. Garso efektas turėtų sustoti (smooth fade out)

## 🎯 Rezultatas:

- **Tikras jetpack garsas** (reaktyvinio variklio garsas)
- **Trys osciliatoriai** sukuria turtingesnį garsą
- **Engine rumble + thrust + air flow** = tikras jetpack efektas
- **Low-pass filter** sukuria tikrą jetpack atmosferą

Jetpack garso efektas dabar skamba kaip **tikras jetpack/reaktyvinis variklis**!



