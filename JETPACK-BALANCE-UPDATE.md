# ⚖️ Jetpack Balansas Atnaujintas

## ✅ Kas pakeista:

Jetpack sistema buvo per OP, todėl sumažinta per pusę:

### Pakeitimai:

1. **Greičio boost sumažintas per pusę:**
   - **Prieš:** +1 iki +3 (2x padidėjimas)
   - **Dabar:** +0.5 iki +1.5 (1x padidėjimas)
   - **Formulė:** `speedBoost = 0.5 + (useTime / 1.5) * 1`

2. **Naudojimo laikas sumažintas per pusę:**
   - **Prieš:** 3 sekundės
   - **Dabar:** 1.5 sekundės
   - **Maksimalus naudojimas:** 1.5s (tada automatiškai išsijungia)

3. **Degalų naudojimas sumažintas per pusę:**
   - **Prieš:** 100 fuel per 3 sekundes (~33.33 per sekundę)
   - **Dabar:** 50 fuel per 1.5 sekundes (~33.33 per sekundę)
   - **Fuel consumption rate:** `50 / 1.5 = ~33.33 per second`

4. **Degalų išsaugojimas:**
   - Degalai **neatsikrauna** automatiškai
   - Degalai išlieka tarp naudojimų (išsaugomi player objekte)
   - Degalai regeneruojasi tik nustojus naudoti jetpack (pilnai per 6 sekundes)

## 🎮 Kaip veikia dabar:

1. **Aktyvavimas:**
   - Paspaudžiate ir laikote SPACE
   - Jetpack aktyvuojamas (jei yra degalų)
   - Greičio boost prasideda nuo +0.5

2. **Naudojimas:**
   - Laikant SPACE, greitis didėja nuo +0.5 iki +1.5 per 1.5 sekundes
   - Degalai naudojami (50 fuel per 1.5 sekundes)
   - Maksimalus naudojimas: 1.5 sekundės (tada automatiškai išsijungia)

3. **Deaktyvavimas:**
   - Paleidžiate SPACE arba pasiekiamas maksimalus laikas (1.5s)
   - Jetpack deaktyvuojamas
   - Degalai pradeda regeneruotis (pilnai per 6 sekundes)

4. **Degalų išsaugojimas:**
   - Degalai **neatsikrauna** automatiškai
   - Jei naudojate 30 fuel, liks 70 fuel
   - Degalai regeneruojasi tik nustojus naudoti jetpack

## 🔧 Techniniai detalės:

### Greičio boost:
```typescript
const maxJetpackTime = 1.5; // Reduced from 3 to 1.5 seconds
const speedBoost = 0.5 + (jetpackUseTime / maxJetpackTime) * 1; // Linear from 0.5 to 1.5
```

### Degalų naudojimas:
```typescript
const fuelConsumptionRate = 50 / maxJetpackTime; // 50 fuel per 1.5 seconds
const fuelConsumed = (fuelConsumptionRate * (now - player.jetpackStartTime)) / 1000;
player.fuel = Math.max(0, player.fuel - fuelConsumed); // Subtract from current fuel, not reset
```

### Degalų regeneracija:
- Pradeda tik nustojus naudoti jetpack
- Pilnai užsipildo per 6 sekundes
- Regeneration rate = 100 / 6000 = ~0.0167 per millisecond

## 📊 Palyginimas:

| Parametras | Prieš | Dabar | Pokytis |
|------------|-------|-------|---------|
| Greičio boost | +1 iki +3 | +0.5 iki +1.5 | -50% |
| Naudojimo laikas | 3s | 1.5s | -50% |
| Degalų naudojimas | 100 per 3s | 50 per 1.5s | -50% |
| Degalų regeneracija | 6s | 6s | Nepakitęs |

## ✅ Testavimas:

1. Paleiskite žaidimą lokaliame režime
2. Perjunkite į PvP arba Training mode
3. Paspaudžiate ir laikote SPACE
4. Turėtumėte matyti:
   - Greičio boost nuo +0.5 iki +1.5 (perpus mažesnis)
   - Naudojimo laikas 1.5 sekundės (perpus trumpesnis)
   - Degalų naudojimas 50 fuel per 1.5s (perpus mažesnis)
5. Paleidžiate SPACE
6. Degalai turėtų likti tokie kokie buvo (neatsikrauti į 100)
7. Degalai turėtų regeneruotis pilnai per 6 sekundes

## 🎯 Rezultatas:

- Jetpack dabar **perpus silpnesnis** (greičio boost +0.5-+1.5 vietoj +1-+3)
- Jetpack dabar **perpus trumpesnis** (1.5s vietoj 3s)
- Degalai **išlieka tarp naudojimų** (neatsikrauna automatiškai)
- Degalai **regeneruojasi tik nustojus naudoti** (pilnai per 6 sekundes)

Jetpack sistema dabar yra **subalansuota** ir nebe OP!










