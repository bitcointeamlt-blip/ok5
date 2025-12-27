# 🔊 Atsokimo Garso Efektas Pridėtas

## ✅ Kas padaryta:

### 1. Pridėtas naujas garso efektas `playBounce()`:
- **Garso tipas:** Spiruoklės arba trampolino garsas
- **Aprašymas:** Bouncy, elastic garsas su frequency sweep
- **Parametrai:**
  - Start dažnis: 600 Hz (aukštas)
  - End dažnis: 300 Hz (žemas) - frequency sweep sukuria bouncy efektą
  - Trukmė: 0.12 sekundės (120ms)
  - Tipas: Sine wave (smooth, elastic garsas)
  - Volume: 20% master volume

### 2. Garso efektas pridėtas kai:
- ✅ **Solo mode:** Dot'as atsoka nuo piešinio (drawn line)
- ✅ **Solo mode:** Dot'as atsoka nuo platformos (moving platform)
- ✅ **PvP/Training mode:** Player'is atsoka nuo piešinio (drawn line)
- ✅ **PvP/Training mode:** Player'is atsoka nuo center platformos (moving platform)
- ✅ **PvP/Training mode:** Player'is atsoka nuo left platformos
- ✅ **PvP/Training mode:** Player'is atsoka nuo right platformos

## 🎮 Kaip veikia:

1. Kai dot'as arba player'is atsoka nuo platformos arba piešinio
2. Automatiškai groja bouncy, elastic garso efektas
3. Garsas skamba kaip spiruoklė arba trampolinas
4. Frequency sweep (nuo aukšto iki žemo) sukuria bouncy efektą

## 🔧 Techniniai detalės:

- Garso efektas naudoja Web Audio API
- Frequency sweep (600Hz → 300Hz) sukuria bouncy efektą
- Automatiškai resume'ina audio context (reikalinga kai kuriais browser'iais)
- Garso efektas yra trumpas (120ms), kad netrukdytų gameplay
- Volume yra lengvas (20%), kad netrukdytų kitų garsų

## 🎵 Garso parametrai:

```typescript
playBounce():
  - Start Frequency: 600 Hz
  - End Frequency: 300 Hz (frequency sweep)
  - Duration: 0.12s (120ms)
  - Type: Sine wave
  - Volume: 20% master volume
  - Attack: 10ms (greitas)
  - Decay: Exponential (ilgesnis decay)
```

## ✅ Testavimas:

1. Paleiskite žaidimą lokaliame režime
2. Nupieškite liniją (right-click ir pieškite)
3. Leiskite dot'ui nukristi ant linijos
4. Turėtumėte išgirsti bouncy garso efektą
5. Bandykite su platforma - taip pat turėtų groti
6. Bandykite PvP/Training mode - taip pat turėtų groti

## 🔇 Garso efektų palyginimas:

- **playDotHit()**: Trumpas, aukštas, metalinis (kaip kaltum per adatą)
  - 1100 Hz, 60ms, square wave, 15% volume
  
- **playBounce()**: Bouncy, elastic (kaip spiruoklė/trampolinas)
  - 600→300 Hz sweep, 120ms, sine wave, 20% volume

## 📝 Vietos kur pridėtas garso efektas:

1. **Solo mode - Line collision** (eilutė ~8287)
2. **Solo mode - Platform collision** (eilutė ~8421)
3. **PvP/Training mode - Line collision** (eilutė ~9534)
4. **PvP/Training mode - Center platform collision** (eilutė ~9574)
5. **PvP/Training mode - Left/Right platform collision** (eilutė ~9595)















