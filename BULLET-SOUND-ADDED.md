# 🔊 Bullet Šūvio Garso Efektas Pridėtas

## ✅ Kas padaryta:

### 1. Pridėtas naujas garso efektas `playBulletShot()`:
- **Garso tipas:** Spjautimas iš vamzdelio (gunshot from barrel)
- **Aprašymas:** Trumpas, aštrus "pop" garsas su dviem tonais
- **Parametrai:**
  - High frequency: 1200→600 Hz (gunshot crack)
  - Mid frequency: 800→400 Hz (barrel echo)
  - Trukmė: 0.05 sekundės (50ms) - labai trumpas
  - Tipai: Square + Sawtooth wave (sharp, crack sound)
  - Volume: 30% master volume

### 2. Garso efektas pridėtas kai:
- ✅ **PvP/Training mode:** Paspaudžiate "3" ir šaudote bullet'ą

## 🎮 Kaip veikia:

1. Paspaudžiate "3" - bullet šaudoma
2. Automatiškai groja trumpas, aštrus garso efektas
3. Garsas skamba kaip spjautimas iš vamzdelio - trumpas "pop"

## 🔧 Techniniai detalės:

- Garso efektas naudoja Web Audio API
- Dvi osciliatoriai (high + mid frequency) sukuria turtingesnį gunshot garsą
- Frequency sweep (nuo aukšto iki žemo) sukuria sprogstamąjį efektą
- Automatiškai resume'ina audio context (reikalinga kai kuriais browser'iais)
- Garso efektas yra labai trumpas (50ms), kad netrukdytų gameplay
- Volume yra lengvas (30%), kad netrukdytų kitų garsų

## 🎵 Garso parametrai:

```typescript
playBulletShot():
  - High Frequency: 1200→600 Hz (square wave)
  - Mid Frequency: 800→400 Hz (sawtooth wave)
  - Duration: 0.05s (50ms)
  - Volume: 30% master volume
  - Attack: 3ms (labai greitas)
  - Decay: Exponential (greitas)
```

## ✅ Testavimas:

1. Paleiskite žaidimą lokaliame režime
2. Perjunkite į PvP arba Training mode
3. Paspaudžiate "3" - bullet šaudoma
4. Turėtumėte išgirsti trumpą, aštrų garso efektą

## 🔇 Garso efektų palyginimas:

- **playDotHit()**: Trumpas, aukštas, metalinis (kaip kaltum per adatą)
  - 1100 Hz, 60ms, square wave, 15% volume
  
- **playBounce()**: Bouncy, elastic (kaip spiruoklė/trampolinas)
  - 600→300 Hz sweep, 120ms, sine wave, 20% volume

- **playProjectileLaunch()**: Trumpas, sprogstamasis (kaip patrankos sprogimas)
  - 80→40 Hz + 400→200 Hz, 80ms, sawtooth + square, 25% volume

- **playBulletShot()**: Trumpas, aštrus (kaip spjautimas iš vamzdelio)
  - 1200→600 Hz + 800→400 Hz, 50ms, square + sawtooth, 30% volume

## 📝 Vieta kur pridėtas garso efektas:

1. **PvP/Training mode - Bullet shot** (eilutė ~7075)
   - Kai paspaudžiate "3" ir šaudote bullet'ą













