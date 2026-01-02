# 🔊 Skausmo Garso Efektas Pridėtas

## ✅ Kas padaryta:

### 1. Pridėtas naujas garso efektas `playDamageHit()`:
- **Garso tipas:** Skausmo/impact garsas kai daromas damage
- **Aprašymas:** Pain/impact sound su dviem tonais
- **Parametrai:**
  - Low frequency: 200→120 Hz (normal) arba 250→150 Hz (crit)
  - Mid frequency: 300→200 Hz (normal) arba 400→250 Hz (crit)
  - Trukmė: 0.15 sekundės (150ms)
  - Tipai: Sawtooth + Square wave (aggressive, painful sound)
  - Volume: 20% (normal) arba 25% (crit)

### 2. Garso efektas pridėtas kai:
- ✅ **PvP/Training mode:** Gauname damage iš oponento (arrow/bullet hit)
- ✅ **PvP/Training mode:** Pataikome į oponentą su arrow (kai daromas damage)
- ✅ **PvP/Training mode:** Pataikome į oponentą su bullet (kai daromas damage)

## 🎮 Kaip veikia:

1. Kai arrow arba bullet pataiko į oponentą
2. Damage taikomas (armor → HP)
3. Automatiškai groja skausmo/impact garso efektas
4. Garsas skamba kaip pain/impact - žemesnis tonas nei kiti garsai
5. Crit hit'ai groja šiek tiek garsiau ir aukštesniu tonu

## 🔧 Techniniai detalės:

- Garso efektas naudoja Web Audio API
- Dvi osciliatoriai (low + mid frequency) sukuria turtingesnį impact garsą
- Frequency sweep (nuo aukšto iki žemo) sukuria impact efektą
- Crit hit'ai groja aukštesniu tonu ir garsiau
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

## ✅ Testavimas:

1. Paleiskite žaidimą lokaliame režime
2. Perjunkite į PvP arba Training mode
3. Šaudykite arrow arba bullet į oponentą
4. Turėtumėte išgirsti skausmo/impact garso efektą
5. Bandykite crit hit'ą - turėtų groti šiek tiek garsiau

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

## 📝 Vietos kur pridėtas garso efektas:

1. **PvP/Training mode - Receive damage** (eilutė ~1710)
   - Kai gauname damage iš oponento (arrow/bullet hit)

2. **PvP/Training mode - Arrow hit opponent** (eilutė ~9070)
   - Kai arrow pataiko į oponentą ir daromas damage

3. **PvP/Training mode - Bullet hit opponent** (eilutė ~8071)
   - Kai bullet pataiko į oponentą ir daromas damage






















