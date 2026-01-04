# 🔊 Toxic Water Garso Efektai Pridėti

## ✅ Kas padaryta:

Pridėti garso efektai toxic water zonoje - skęsimo garsas ir duslesnis damage garsas (tarsi už uždarytų durų).

### Funkcijos:

1. **Skęsimo garso efektas:**
   - Groja kai žaidėjas patenka į toxic water
   - Underwater/muffled sound (tarsi skęsta vandenyje)
   - Low-pass filter efektas (duslesnis garsas)
   - 0.4 sekundės trukmė

2. **Duslesnis damage garso efektas:**
   - Groja kai daromas damage toxic water zonoje
   - Muffled sound (tarsi už uždarytų durų)
   - Low-pass filter efektas (600 Hz cutoff)
   - Žemesnis volume (12% vietoj 20%)
   - 0.15 sekundės trukmė

## 🎮 Kaip veikia:

1. **Įėjimas į toxic water:**
   - Groja skęsimo garso efektas (underwater/muffled sound)
   - Iš karto taikomas -1 dmg su duslesniu damage garso efektu

2. **Damage toxic water zonoje:**
   - Kiekvieną sekundę groja duslesnis damage garso efektas
   - Garsas tarsi už uždarytų durų (muffled)
   - Low-pass filter sumažina aukštus tonus

3. **Išėjimas iš toxic water:**
   - Garso efektai sustabdomi
   - Normalūs garso efektai vėl veikia

## 🔧 Techniniai detalės:

### Skęsimo garso efektas:
```typescript
playDrowningSound():
  - Low frequency: 150→100 Hz (underwater pressure)
  - Mid frequency: 300→200 Hz (bubble sound)
  - Type: Sawtooth + Sine
  - Low-pass filter: 800 Hz cutoff
  - Volume: 15%→12% (muffled)
  - Duration: 0.4s
```

### Duslesnis damage garso efektas:
```typescript
playMuffledDamageHit():
  - Low frequency: 150→100 Hz (muffled impact)
  - Mid frequency: 250→180 Hz (muffled impact)
  - Type: Sawtooth + Square
  - Low-pass filter: 600 Hz cutoff (duslesnis nei skęsimo)
  - Volume: 12% (quieter than normal damage)
  - Duration: 0.15s
```

### Low-pass filter:
- **Skęsimo garsas:** 800 Hz cutoff (muffled underwater)
- **Damage garsas:** 600 Hz cutoff (duslesnis, tarsi už durų)
- **Efektas:** Sumažina aukštus tonus, sukuria "muffled" efektą

## 📊 Palyginimas:

| Parametras | Normalus Damage | Muffled Damage | Skęsimo Garsas |
|------------|----------------|----------------|----------------|
| Frequency | 200→120 Hz | 150→100 Hz | 150→100 Hz |
| Filter | None | 600 Hz LP | 800 Hz LP |
| Volume | 20% | 12% | 15%→12% |
| Duration | 0.15s | 0.15s | 0.4s |
| Efektas | Normalus | Duslesnis | Underwater |

## ✅ Testavimas:

1. Paleiskite žaidimą lokaliame režime
2. Perjunkite į PvP arba Training mode
3. Nukriste į toxic water zoną (tarp platformos ir bottom floor)
4. Turėtumėte išgirsti:
   - **Skęsimo garso efektą** (underwater/muffled sound)
   - **Duslesnį damage garso efektą** kiekvieną sekundę (tarsi už uždarytų durų)
   - Garsai turėtų skambėti dusliau nei normalūs damage garsai
5. Išlipkite iš vandens
6. Normalūs garso efektai vėl veikia

## 🎯 Rezultatas:

- **Skęsimo garso efektas** kai patenkate į toxic water
- **Duslesnis damage garso efektas** kai daromas damage (tarsi už uždarytų durų)
- **Low-pass filter** sukuria muffled efektą
- **Underwater atmosfera** su skęsimo garsu

Toxic water zona dabar turi **unikalius garso efektus**, kurie sukuria underwater atmosferą!
























