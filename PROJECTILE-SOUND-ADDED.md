# 🔊 Projectile Šūvio Garso Efektas Pridėtas

## ✅ Kas padaryta:

### 1. Pridėtas naujas garso efektas `playProjectileLaunch()`:
- **Garso tipas:** Patrankos sprogimo "puff" garsas
- **Aprašymas:** Trumpas, sprogstamasis garsas su dviem tonais
- **Parametrai:**
  - Low frequency: 80→40 Hz (cannon boom)
  - High frequency: 400→200 Hz (explosion crack)
  - Trukmė: 0.08 sekundės (80ms) - labai trumpas
  - Tipas: Sawtooth + Square wave (aggressive, sharp sound)
  - Volume: 25% master volume

### 2. Garso efektas pridėtas kai:
- ✅ **PvP/Training mode:** Paspaudžiate "2" ir paleidžiate projectile šūvį

## 🎮 Kaip veikia:

1. Paspaudžiate "2" - projectile pradeda charge'intis
2. Paleidžiate "2" - projectile šaudoma
3. Automatiškai groja trumpas, sprogstamasis garso efektas
4. Garsas skamba kaip patrankos sprogimas - trumpas "puff"

## 🔧 Techniniai detalės:

- Garso efektas naudoja Web Audio API
- Dvi osciliatoriai (low + high frequency) sukuria turtingesnį sprogstamąjį garsą
- Frequency sweep (nuo aukšto iki žemo) sukuria sprogstamąjį efektą
- Automatiškai resume'ina audio context (reikalinga kai kuriais browser'iais)
- Garso efektas yra labai trumpas (80ms), kad netrukdytų gameplay
- Volume yra lengvas (25%), kad netrukdytų kitų garsų

## 🎵 Garso parametrai:

```typescript
playProjectileLaunch():
  - Low Frequency: 80→40 Hz (sawtooth wave)
  - High Frequency: 400→200 Hz (square wave)
  - Duration: 0.08s (80ms)
  - Volume: 25% master volume
  - Attack: 5ms (labai greitas)
  - Decay: Exponential (greitas)
```

## ✅ Testavimas:

1. Paleiskite žaidimą lokaliame režime
2. Perjunkite į PvP arba Training mode
3. Paspaudžiate "2" - projectile pradeda charge'intis
4. Paleidžiate "2" - projectile šaudoma
5. Turėtumėte išgirsti trumpą, sprogstamąjį garso efektą

## 🔇 Garso efektų palyginimas:

- **playDotHit()**: Trumpas, aukštas, metalinis (kaip kaltum per adatą)
  - 1100 Hz, 60ms, square wave, 15% volume
  
- **playBounce()**: Bouncy, elastic (kaip spiruoklė/trampolinas)
  - 600→300 Hz sweep, 120ms, sine wave, 20% volume

- **playProjectileLaunch()**: Trumpas, sprogstamasis (kaip patrankos sprogimas)
  - 80→40 Hz + 400→200 Hz, 80ms, sawtooth + square, 25% volume

## 📝 Vieta kur pridėtas garso efektas:

1. **PvP/Training mode - Projectile launch** (eilutė ~7182)
   - Kai paspaudžiate "2" ir paleidžiate projectile šūvį



