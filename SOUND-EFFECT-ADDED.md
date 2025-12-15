# 🔊 Garso Efektas Pridėtas

## ✅ Kas padaryta:

### 1. Pridėtas AudioManager import ir instancas:
- Importuotas `AudioManager` į `simple-main.ts`
- Sukurtas `audioManager` instancas

### 2. Pridėtas naujas garso efektas `playDotHit()`:
- **Garso tipas:** Trumpas, lengvas, aukštas tonas
- **Aprašymas:** Kaip kaltum per adatą su plaktuku
- **Parametrai:**
  - Dažnis: 1100 Hz (aukštas, metalinis garsas)
  - Trukmė: 0.06 sekundės (labai trumpas)
  - Tipas: Square wave (metalinis/percussive garsas)
  - Volume: 15% master volume (lengvas)

### 3. Garso efektas pridėtas kai:
- ✅ **Solo mode:** Paspaudžiate ant juodo taško (dot) ir jis pradeda judėti
- ✅ **PvP/Training mode:** Paspaudžiate ant savo player'io ir jis pradeda judėti
- ✅ **Solo mode:** Strėlė pataiko į dot'ą ir jis pradeda judėti

## 🎮 Kaip veikia:

1. Kai paspaudžiate ant juodo taško (dot) arba player'io
2. Dot/player pradeda judėti (gauna force)
3. Automatiškai groja trumpas, lengvas garso efektas
4. Garsas skamba kaip kaltum per adatą su plaktuku

## 🔧 Techniniai detalės:

- Garso efektas naudoja Web Audio API
- Automatiškai resume'ina audio context (reikalinga kai kuriais browser'iais)
- Garso efektas yra labai trumpas (60ms), kad netrukdytų gameplay
- Volume yra lengvas (15%), kad netrukdytų kitų garsų

## 🎵 Garso parametrai:

```typescript
playDotHit():
  - Frequency: 1100 Hz
  - Duration: 0.06s (60ms)
  - Type: Square wave
  - Volume: 15% master volume
  - Attack: 5ms (labai greitas)
  - Decay: Exponential (greitas)
```

## ✅ Testavimas:

1. Paleiskite žaidimą lokaliame režime
2. Paspaudžiate ant juodo taško (Solo mode)
3. Turėtumėte išgirsti trumpą, lengvą garso efektą
4. Bandykite PvP/Training mode - taip pat turėtų groti

## 🔇 Jei nenorite garsų:

Garso efektas automatiškai nebus grojamas jei:
- Browser neturi Web Audio API palaikymo
- Audio context yra suspended (bet kodas automatiškai bando resume'inti)










