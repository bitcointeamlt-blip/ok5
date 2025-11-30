# ⛽ Degalų Talpa Padidinta

## ✅ Kas pakeista:

Degalų talpa padidinta nuo 100 iki 200 (2x padidėjimas).

### Pakeitimai:

1. **Maksimali talpa:**
   - **Prieš:** 100 fuel
   - **Dabar:** 200 fuel
   - **Padidėjimas:** 2x

2. **Pradinė talpa:**
   - **Prieš:** 100 fuel (pilnas kanistras)
   - **Dabar:** 200 fuel (pilnas kanistras)

3. **Degalų naudojimas:**
   - **Prieš:** 50 fuel per 1.5 sekundes (~33.33 per sekundę)
   - **Dabar:** 100 fuel per 1.5 sekundes (~66.67 per sekundę)
   - **Proporcija:** Ta pati (50% talpos per 1.5s)

4. **Degalų regeneracija:**
   - **Prieš:** 100 fuel per 6 sekundes (~16.67 per sekundę)
   - **Dabar:** 200 fuel per 6 sekundes (~33.33 per sekundę)
   - **Proporcija:** Ta pati (pilnai per 6s)

## 🎮 Kaip veikia dabar:

1. **Pradinė talpa:**
   - Žaidėjas prasideda su 200 fuel (pilnas kanistras)

2. **Naudojimas:**
   - 100 fuel per 1.5 sekundes (50% talpos)
   - Maksimalus naudojimas: 1.5 sekundės (tada automatiškai išsijungia)
   - Jei naudojate iki 0% - prasideda perkaitimas (2 sekundės)

3. **Regeneracija:**
   - Pilnai užsipildo per 6 sekundes (200 fuel)
   - Regeneracija prasideda tik nustojus naudoti jetpack ir po perkaitimo

## 📊 Palyginimas:

| Parametras | Prieš | Dabar | Pokytis |
|------------|-------|-------|---------|
| Maksimali talpa | 100 | 200 | +100% |
| Pradinė talpa | 100 | 200 | +100% |
| Naudojimas per 1.5s | 50 | 100 | +100% |
| Regeneracija per 6s | 100 | 200 | +100% |
| Naudojimo laikas (iki 0%) | 3s | 3s | Nepakitęs |
| Perkaitimo laikas | 2s | 2s | Nepakitęs |

## ✅ Testavimas:

1. Paleiskite žaidimą lokaliame režime
2. Perjunkite į PvP arba Training mode
3. Turėtumėte matyti:
   - Fuel bar rodo 200% (pilnas kanistras)
   - Fuel text: "FUEL: 200%"
4. Paspaudžiate ir laikote SPACE
5. Turėtumėte matyti:
   - Degalai naudojami (100 fuel per 1.5s)
   - Naudojimo laikas iki 0%: 3 sekundės (2x naudojimas)
   - Po perkaitimo degalai atsistatina iki 200 (pilnai per 6s)

## 🎯 Rezultatas:

- Degalų talpa padidinta **2x** (nuo 100 iki 200)
- Naudojimo laikas iki 0%: **3 sekundės** (2x naudojimas)
- Regeneracija: **200 fuel per 6 sekundes**
- Proporcijos išliko tokios pačios (50% talpos per 1.5s naudojimo)

Jetpack sistema dabar turi **dvigubai daugiau degalų**!


