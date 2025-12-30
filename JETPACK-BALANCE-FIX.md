# ⚖️ Jetpack Balansas Pataisytas

## ✅ Kas pakeista:

Jetpack sistema buvo per greitai išsinaudojanti ir speed efektas buvo per silpnas. Dabar pataisyta:

### Pakeitimai:

1. **Degalų talpa grąžinta į 100%:**
   - **Prieš:** 200 fuel
   - **Dabar:** 100 fuel
   - **Grąžinta į originalią talpą**

2. **Degalų naudojimas sumažintas (lėčiau išsinaudoja):**
   - **Prieš:** 100 fuel per 1.5 sekundes (~66.67 per sekundę)
   - **Dabar:** 30 fuel per 1.5 sekundes (~20 per sekundę)
   - **Sumažinta:** 3.3x lėčiau išsinaudoja
   - **Naudojimo laikas iki 0%:** ~5 sekundės (vietoj ~1.5s)

3. **Speed boost padidintas (geresnis efektas):**
   - **Prieš:** +0.5 iki +1.5 (per pusę sumažintas)
   - **Dabar:** +1 iki +3 (dvigubai didesnis)
   - **Padidėjimas:** 2x stipresnis speed boost

4. **Speed boost multiplier padidintas:**
   - **Prieš:** 0.1 multiplier
   - **Dabar:** 0.15 multiplier
   - **Padidėjimas:** 50% stipresnis efektas

## 🎮 Kaip veikia dabar:

1. **Pradinė talpa:**
   - Žaidėjas prasideda su 100 fuel (pilnas kanistras)

2. **Naudojimas:**
   - 30 fuel per 1.5 sekundes (~20 per sekundę)
   - Maksimalus naudojimas: 1.5 sekundės (tada automatiškai išsijungia)
   - Naudojimo laikas iki 0%: ~5 sekundės (lėčiau išsinaudoja)

3. **Speed boost:**
   - Prasideda nuo +1 ir didėja iki +3 per 1.5 sekundes
   - 50% stipresnis efektas (0.15 multiplier)
   - Gerai jaučiamas speed boost

4. **Regeneracija:**
   - Pilnai užsipildo per 6 sekundes (100 fuel)
   - Regeneracija prasideda tik nustojus naudoti jetpack ir po perkaitimo

## 📊 Palyginimas:

| Parametras | Prieš | Dabar | Pokytis |
|------------|-------|-------|---------|
| Maksimali talpa | 200 | 100 | -50% |
| Naudojimas per 1.5s | 100 | 30 | -70% |
| Naudojimo laikas iki 0% | ~1.5s | ~5s | +233% |
| Speed boost | +0.5-+1.5 | +1-+3 | +100% |
| Speed multiplier | 0.1 | 0.15 | +50% |
| Regeneracija per 6s | 200 | 100 | -50% |

## ✅ Testavimas:

1. Paleiskite žaidimą lokaliame režime
2. Perjunkite į PvP arba Training mode
3. Turėtumėte matyti:
   - Fuel bar rodo 100% (pilnas kanistras)
   - Fuel text: "FUEL: 100%"
4. Paspaudžiate ir laikote SPACE
5. Turėtumėte matyti:
   - **Gerai jaučiamas speed boost** (nuo +1 iki +3)
   - Degalai naudojami lėčiau (30 fuel per 1.5s)
   - Naudojimo laikas iki 0%: ~5 sekundės
   - "JETPACK: +X.X SPEED" tekstas rodo didesnį boost

## 🎯 Rezultatas:

- Degalų talpa: **100%** (grąžinta)
- Degalų naudojimas: **3.3x lėčiau** (30 per 1.5s vietoj 100)
- Speed boost: **2x stipresnis** (+1-+3 vietoj +0.5-+1.5)
- Speed efektas: **50% stipresnis** (0.15 multiplier)
- Naudojimo laikas iki 0%: **~5 sekundės** (vietoj ~1.5s)

Jetpack sistema dabar yra **subalansuota** su geresniu speed efektu ir lėtesniu degalų naudojimu!
















