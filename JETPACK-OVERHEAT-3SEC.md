# 🔥 Perkaitimo Laikas Padidintas iki 3 Sekundžių

## ✅ Kas pakeista:

Perkaitimo laikas padidintas nuo 2 sekundžių iki 3 sekundžių.

### Pakeitimai:

1. **Perkaitimo laikas:**
   - **Prieš:** 2 sekundės
   - **Dabar:** 3 sekundės
   - **Padidėjimas:** +50% (1 sekundė ilgiau)

2. **Perkaitimo efektas:**
   - Perkaitimas trunka **3 sekundes** (vietoj 2s)
   - Perkaitimo metu degalai **neatsistatina** (3 sekundžių pause)
   - Perkaitimo metu negalima naudoti jetpack

3. **UI rodymas:**
   - "OVERHEAT: X.Xs" tekstas rodo likusį laiką (iki 3.0s)
   - Raudonas fuel bar su pulsing efektu
   - Raudonas border

## 🎮 Kaip veikia dabar:

1. **Degalų pasiekimas 0%:**
   - Jetpack automatiškai išsijungia
   - Prasideda perkaitimas (**3 sekundės**)
   - Fuel bar tampa raudonas
   - Pulsing raudonas glow efektas

2. **Perkaitimo metu:**
   - Negalima naudoti jetpack (SPACE neveikia)
   - Degalai **neatsistatina** (3 sekundžių pause)
   - Raudonas fuel bar su pulsing efektu
   - "OVERHEAT: X.Xs" tekstas (nuo 3.0s iki 0.0s)

3. **Po perkaitimo:**
   - Perkaitimas baigiasi (po 3 sekundžių)
   - Degalai pradeda atsistatinti (pilnai per 6 sekundes)
   - Fuel bar tampa žalias
   - Galima vėl naudoti jetpack

## 📊 Palyginimas:

| Parametras | Prieš | Dabar | Pokytis |
|------------|-------|-------|---------|
| Perkaitimo laikas | 2s | 3s | +50% |
| Degalų pause | 2s | 3s | +50% |
| Regeneracijos pradžia | Po 2s | Po 3s | +1s |

## ✅ Testavimas:

1. Paleiskite žaidimą lokaliame režime
2. Perjunkite į PvP arba Training mode
3. Paspaudžiate ir laikote SPACE iki degalų pasiekimo 0%
4. Turėtumėte matyti:
   - Fuel bar tampa raudonas
   - Pulsing raudonas glow efektas
   - "OVERHEAT: 3.0s" tekstas (pradedant nuo 3.0s)
   - SPACE neveikia (negali naudoti jetpack)
5. Laukite 3 sekundes
6. Turėtumėte matyti:
   - Fuel bar tampa žalias
   - Degalai pradeda atsistatinti
   - Galima vėl naudoti jetpack

## 🎯 Rezultatas:

- Perkaitimo laikas: **3 sekundės** (vietoj 2s)
- Degalų pause: **3 sekundės** (vietoj 2s)
- Regeneracijos pradžia: **Po 3 sekundžių** (vietoj 2s)

Jetpack sistema dabar turi **ilgesnį perkaitimo laiką** (3 sekundės)!























