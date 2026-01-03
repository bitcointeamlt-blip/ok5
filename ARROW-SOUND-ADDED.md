# 🔊 Strėlės Šūvio Garso Efektas Pridėtas

## ✅ Kas padaryta:

### 1. Pridėtas naujas garso efektas `playArrowShot()`:
- **Garso tipas:** Strėlės skrydis ore ("fffiiiit" garsas)
- **Aprašymas:** Ilgesnis garsas su frequency sweep, simuliuoja strėlę skrendančią ore
- **Parametrai:**
  - Start dažnis: 900 Hz (aukštas)
  - End dažnis: 300 Hz (žemas) - frequency sweep sukuria "fffiiiit" efektą
  - Trukmė: 0.25 sekundės (250ms) - ilgesnis nei kiti garsai
  - Tipas: Sine wave (smooth, airy sound)
  - Volume: 20% → 15% (sustain) → decay

### 2. Garso efektas pridėtas kai:
- ✅ **Solo mode:** Paspaudžiate "1" ir tada click - šaudote strėlę
- ✅ **PvP/Training mode:** Paspaudžiate "1" ir tada click - šaudote strėlę

## 🎮 Kaip veikia:

1. Paspaudžiate "1" - strėlė tampa ready
2. Click - strėlė šaudoma
3. Automatiškai groja ilgesnis garso efektas
4. Garsas skamba kaip strėlė skrendanti ore - "fffiiiit"
5. Frequency sweep (nuo aukšto iki žemo) sukuria skrydžio efektą

## 🔧 Techniniai detalės:

- Garso efektas naudoja Web Audio API
- Frequency sweep (900→300 Hz) sukuria "fffiiiit" efektą
- Ilgesnė trukmė (250ms) nei kiti garsai - simuliuoja strėlės skrydį
- Automatiškai resume'ina audio context (reikalinga kai kuriais browser'iais)
- Volume yra lengvas (20% → 15%), kad netrukdytų kitų garsų

## 🎵 Garso parametrai:

```typescript
playArrowShot():
  - Start Frequency: 900 Hz
  - End Frequency: 300 Hz (frequency sweep)
  - Duration: 0.25s (250ms) - ilgesnis nei kiti
  - Type: Sine wave
  - Volume: 20% → 15% (sustain) → decay
  - Attack: 10ms (greitas)
  - Sustain: 100ms (viduryje)
  - Decay: Exponential (ilgesnis)
```

## ✅ Testavimas:

1. Paleiskite žaidimą lokaliame režime
2. Paspaudžiate "1" - strėlė tampa ready
3. Click - strėlė šaudoma
4. Turėtumėte išgirsti ilgesnį "fffiiiit" garso efektą
5. Bandykite PvP/Training mode - taip pat turėtų groti

## 🔇 Garso efektų palyginimas:

- **playDotHit()**: Trumpas, aukštas, metalinis (kaip kaltum per adatą)
  - 1100 Hz, 60ms, square wave, 15% volume
  
- **playBounce()**: Bouncy, elastic (kaip spiruoklė/trampolinas)
  - 600→300 Hz sweep, 120ms, sine wave, 20% volume

- **playProjectileLaunch()**: Trumpas, sprogstamasis (kaip patrankos sprogimas)
  - 80→40 Hz + 400→200 Hz, 80ms, sawtooth + square, 25% volume

- **playBulletShot()**: Trumpas, aštrus (kaip spjautimas iš vamzdelio)
  - 1200→600 Hz + 800→400 Hz, 50ms, square + sawtooth, 30% volume

- **playArrowShot()**: Ilgesnis, airy (kaip strėlė skrendanti ore - fffiiiit)
  - 900→300 Hz sweep, 250ms, sine wave, 20%→15% volume

## 📝 Vietos kur pridėtas garso efektas:

1. **Solo mode - Arrow launch** (eilutė ~7341)
   - Kai paspaudžiate "1" ir tada click - šaudote strėlę

2. **PvP/Training mode - Arrow launch** (eilutė ~7591)
   - Kai paspaudžiate "1" ir tada click - šaudote strėlę























