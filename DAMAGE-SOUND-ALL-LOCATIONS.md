# 🔊 Skausmo Garso Efektas Pridėtas Visur Kur Daromas Damage

## ✅ Kas padaryta:

Pridėtas garso efektas `playDamageHit()` visur kur tik daromas damage, nepriklausomai nuo damage tipo.

### Damage tipai su garso efektu:

#### Solo Mode:
1. ✅ **Click damage** - kai paspaudžiate ant DOT ir daromas damage
2. ✅ **Arrow damage** - kai arrow pataiko į DOT
3. ✅ **Combo bonus damage** - kai combo pasiekia 100% (4x damage)
4. ✅ **Platform bounce bonus damage** - kai DOT atsoka nuo platformos su speed >= 7 (2x damage)
5. ✅ **Line bounce combo bonus damage** - kai DOT atsoka nuo drawn line ir combo pasiekia 100% (4x damage)

#### PvP/Training Mode:
1. ✅ **Arrow hit opponent** - kai arrow pataiko į oponentą
2. ✅ **Bullet hit opponent** - kai bullet pataiko į oponentą
3. ✅ **Projectile hit opponent** - kai projectile pataiko į oponentą
4. ✅ **Receive damage from opponent** - kai gauname damage iš oponento (arrow/bullet/projectile)
5. ✅ **Collision damage** - kai du žaidėjai susiduria ir vienas daro damage kitam
6. ✅ **Wall spikes damage** - kai žaidėjas patenka į wall spikes (left/right walls)

## 🎮 Kaip veikia:

1. Bet kur daromas damage (armor → HP)
2. Automatiškai groja skausmo/impact garso efektas
3. Garsas skamba kaip pain/impact - žemesnis tonas nei kiti garsai
4. Crit hit'ai groja šiek tiek garsiau ir aukštesniu tonu
5. Combo bonus ir speed bonus damage'ai groja kaip crit hit'ai (garsiau)

## 🔧 Techniniai detalės:

- Garso efektas naudoja Web Audio API
- Dvi osciliatoriai (low + mid frequency) sukuria turtingesnį impact garsą
- Frequency sweep (nuo aukšto iki žemo) sukuria impact efektą
- Crit hit'ai groja aukštesniu tonu ir garsiau (250→150 Hz vs 200→120 Hz)
- Automatiškai resume'ina audio context (reikalinga kai kuriais browser'iais)
- Garso efektas yra trumpas (150ms), kad netrukdytų gameplay

## 🎵 Garso parametrai:

```typescript
playDamageHit(isCrit: boolean):
  - Low Frequency: 200→120 Hz (normal) arba 250→150 Hz (crit)
  - Mid Frequency: 300→200 Hz (normal) arba 400→250 Hz (crit)
  - Duration: 0.15s (150ms)
  - Types: Sawtooth + Square wave
  - Volume: 20% (normal) arba 25% (crit)
  - Attack: 10ms (greitas)
  - Decay: Exponential (vidutinis)
```

## 📝 Visos vietos kur pridėtas garso efektas:

### Solo Mode:
1. **Click damage** (eilutė ~7467)
   - Kai paspaudžiate ant DOT ir daromas damage
   
2. **Arrow damage** (eilutė ~10389)
   - Kai arrow pataiko į DOT
   
3. **Combo bonus damage (line bounce)** (eilutė ~7418)
   - Kai DOT atsoka nuo drawn line ir combo pasiekia 100%
   
4. **Combo bonus damage (platform bounce)** (eilutė ~8488)
   - Kai DOT atsoka nuo platformos ir combo pasiekia 100%
   
5. **Speed bonus damage (line bounce)** (eilutė ~8417)
   - Kai DOT atsoka nuo drawn line su speed >= 7
   
6. **Speed bonus damage (platform bounce)** (eilutė ~8548)
   - Kai DOT atsoka nuo platformos su speed >= 7

### PvP/Training Mode:
1. **Receive damage** (eilutė ~1710)
   - Kai gauname damage iš oponento (arrow/bullet/projectile)
   
2. **Arrow hit opponent** (eilutė ~9070)
   - Kai arrow pataiko į oponentą
   
3. **Bullet hit opponent** (eilutė ~8071)
   - Kai bullet pataiko į oponentą
   
4. **Projectile hit opponent** (eilutė ~9405)
   - Kai projectile pataiko į oponentą
   
5. **Collision damage (player 1 → player 2)** (eilutė ~10149)
   - Kai du žaidėjai susiduria ir player 1 daro damage player 2
   
6. **Collision damage (player 2 → player 1)** (eilutė ~10198)
   - Kai du žaidėjai susiduria ir player 2 daro damage player 1
   
7. **Wall spikes damage (left wall)** (eilutė ~8865)
   - Kai žaidėjas patenka į left wall spikes
   
8. **Wall spikes damage (right wall)** (eilutė ~8905)
   - Kai žaidėjas patenka į right wall spikes

## ✅ Testavimas:

1. **Solo Mode:**
   - Paspaudžiate ant DOT - turėtumėte išgirsti garso efektą
   - Šaudote arrow - turėtumėte išgirsti garso efektą
   - Atsokite nuo platformos su speed >= 7 - turėtumėte išgirsti garso efektą
   - Pasiekite combo 100% - turėtumėte išgirsti garso efektą

2. **PvP/Training Mode:**
   - Šaudote arrow/bullet/projectile į oponentą - turėtumėte išgirsti garso efektą
   - Gaunate damage iš oponento - turėtumėte išgirsti garso efektą
   - Susiduriate su oponentu - turėtumėte išgirsti garso efektą
   - Patenkate į wall spikes - turėtumėte išgirsti garso efektą

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
  - 1200→500 Hz + 1000→400 Hz, 250ms, square + sine, 18%→12% volume

- **playDamageHit()**: Skausmo/impact (kaip pain/impact kai daromas damage)
  - 200→120 Hz + 300→200 Hz (normal) arba 250→150 Hz + 400→250 Hz (crit)
  - 150ms, sawtooth + square, 20% (normal) arba 25% (crit) volume
  - ✅ **Dabar groja VISUR kur daromas damage!**

