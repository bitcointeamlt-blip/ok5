# 🔊 Jetpack Garso Efektas - Progresuojantis (Silpnas → Stiprus)

## ✅ Kas pakeista:

Jetpack garso efekto volume logika pakeista - dabar garsas pradžioje silpnas ir stiprėja prie galo.

### Pakeitimai:

1. **Volume progresija:**
   - **Pradžioje (100% degalų):** Labai silpnas (5% volume)
   - **Viduryje (50% degalų):** Vidutinis (~10% volume)
   - **Pabaigoje (0% degalų):** Stiprus (20% volume)
   - **Exponential curve:** Naudojama 1.5 power curve smooth transition

2. **Volume curve:**
   - **Prieš:** Linear (tiesioginis padidėjimas)
   - **Dabar:** Exponential curve (1.5 power)
   - **Efektas:** Pradžioje lėtai didėja, pabaigoje greitai didėja

3. **Volume range:**
   - **Base:** 5% (labai silpnas pradžioje)
   - **Max:** 20% (stiprus pabaigoje)
   - **Range:** 5%→20% (15% padidėjimas)

## 🎮 Kaip veikia dabar:

1. **Pradžioje (100% degalų):**
   - **Volume:** 5% (labai silpnas)
   - **Efektas:** Tylus jetpack garsas

2. **Viduryje (50% degalų):**
   - **Volume:** ~10% (vidutinis)
   - **Efektas:** Vidutinis jetpack garsas

3. **Prieš perdegimą (0% degalų):**
   - **Volume:** 20% (stiprus)
   - **Efektas:** Stiprus jetpack garsas

4. **Exponential curve:**
   - **Pradžioje:** Lėtai didėja (5% → 8% → 10%)
   - **Pabaigoje:** Greitai didėja (15% → 18% → 20%)
   - **Smooth transition:** Nėra staigių šuolių

## 📊 Palyginimas:

| Degalų % | Prieš (Linear) | Dabar (Exponential) |
|----------|----------------|---------------------|
| 100% | 8% | 5% (silpnas) |
| 75% | 11% | ~7% |
| 50% | 13% | ~10% |
| 25% | 15.5% | ~15% |
| 0% | 18% | 20% (stiprus) |

## 🔧 Techniniai detalės:

### Volume skaičiavimas:
```typescript
const baseVolume = 0.05; // Very weak at start
const maxVolume = 0.2; // Strong at end
const fuelRemaining = fuelPercent; // 1.0 = full, 0.0 = empty
const volumeCurve = Math.pow(1 - fuelRemaining, 1.5); // Exponential curve
const volume = baseVolume + volumeCurve * (maxVolume - baseVolume);
```

### Exponential curve:
- **Power:** 1.5 (smoother than linear, not too aggressive)
- **Efektas:** Pradžioje lėtai didėja, pabaigoje greitai didėja
- **Smooth transition:** Nėra staigių šuolių

## ✅ Testavimas:

1. Paleiskite žaidimą lokaliame režime
2. Perjunkite į PvP arba Training mode
3. Paspaudžiate ir laikote SPACE
4. Turėtumėte išgirsti:
   - **Labai silpną jetpack garsą** pradžioje (5% volume)
   - Garso efektas **lėtai didėja** pradžioje
   - Garso efektas **greitai didėja** pabaigoje
   - **Stiprus jetpack garsas** prieš perdegimą (20% volume)
5. Paleidžiate SPACE
6. Garso efektas turėtų sustoti (smooth fade out)

## 🎯 Rezultatas:

- **Silpnas pradžioje** (5% volume)
- **Stiprėja prie galo** (20% volume)
- **Exponential curve** sukuria smooth transition
- **Progresuojantis garsas** - nuo silpno iki stipraus

Jetpack garso efektas dabar **pradžioje silpnas ir stiprėja prie galo**!
























