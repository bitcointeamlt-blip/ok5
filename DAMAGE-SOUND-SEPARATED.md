# 🔊 Damage Garso Efektai Atskirti

## ✅ Kas padaryta:

Pridėti du skirtingi garso efektai - vienas kai daromas damage oponentui, kitas kai gaunamas damage iš oponento.

### Funkcijos:

1. **Damage Dealt Sound (`playDamageDealt`):**
   - Groja kai **daromas damage oponentui**
   - Satisfying hit sound (patenkinantis smūgio garsas)
   - Aukštesnis tonas (350→200 Hz normal, 400→250 Hz crit)
   - Sharp, satisfying sound (square wave)
   - Garsesnis (25% normal, 30% crit)

2. **Damage Received Sound (`playDamageReceived`):**
   - Groja kai **gaunamas damage iš oponento**
   - Pain/impact sound (skausmo/impact garsas)
   - Žemesnis tonas (200→120 Hz normal, 250→150 Hz crit)
   - Painful sound (sawtooth + square wave)
   - Normalus volume (20% normal, 25% crit)

## 🎮 Kaip veikia:

1. **Kai darote damage oponentui:**
   - Arrow hit opponent → `playDamageDealt`
   - Bullet hit opponent → `playDamageDealt`
   - Projectile hit opponent → `playDamageDealt`
   - Collision damage (player 1 → player 2) → `playDamageDealt`
   - Satisfying hit sound (patenkinantis smūgio garsas)

2. **Kai gaunate damage:**
   - Receive damage from opponent → `playDamageReceived`
   - Collision damage (player 2 → player 1) → `playDamageReceived`
   - Solo mode damage (click, arrow, combo, speed bonus) → `playDamageReceived`
   - Toxic water damage → `playMuffledDamageHit` (specialus muffled garsas)
   - Wall spikes damage → `playDamageReceived`
   - Pain/impact sound (skausmo/impact garsas)

## 🔧 Techniniai detalės:

### Damage Dealt Sound:
```typescript
playDamageDealt(isCrit: boolean):
  - Low Frequency: 350→200 Hz (normal) arba 400→250 Hz (crit)
  - Mid Frequency: 500→350 Hz (normal) arba 600→400 Hz (crit)
  - Duration: 0.12s (120ms)
  - Types: Square + Square wave (sharp, satisfying)
  - Volume: 25% (normal) arba 30% (crit)
  - Attack: 5ms (very quick)
  - Decay: Exponential (quick)
```

### Damage Received Sound:
```typescript
playDamageReceived(isCrit: boolean):
  - Low Frequency: 200→120 Hz (normal) arba 250→150 Hz (crit)
  - Mid Frequency: 300→200 Hz (normal) arba 400→250 Hz (crit)
  - Duration: 0.15s (150ms)
  - Types: Sawtooth + Square wave (painful)
  - Volume: 20% (normal) arba 25% (crit)
  - Attack: 10ms (quick)
  - Decay: Exponential (medium)
```

## 📊 Palyginimas:

| Parametras | Damage Dealt | Damage Received |
|------------|--------------|-----------------|
| Frequency | 350→200 Hz | 200→120 Hz |
| Type | Square + Square | Sawtooth + Square |
| Volume | 25%→30% | 20%→25% |
| Duration | 0.12s | 0.15s |
| Efektas | Satisfying hit | Pain/impact |
| Tonas | Aukštesnis | Žemesnis |

## 📝 Visos vietos kur naudojami garso efektai:

### Damage Dealt (darome damage):
1. **Arrow hit opponent** (eilutė ~8276)
2. **Bullet hit opponent** (eilutė ~9431)
3. **Projectile hit opponent** (eilutė ~9754)
4. **Collision damage (player 1 → player 2)** (eilutė ~10503)

### Damage Received (gauname damage):
1. **Receive damage from opponent** (eilutė ~1780)
2. **Solo mode click damage** (eilutė ~7665)
3. **Solo mode arrow damage** (eilutė ~10753)
4. **Solo mode combo bonus** (eilutė ~7610, 8551, 8692)
5. **Solo mode speed bonus** (eilutė ~8615)
6. **Collision damage (player 2 → player 1)** (eilutė ~10557)
7. **Wall spikes damage** (eilutė ~9204, 9249)

### Specialus (Toxic Water):
1. **Toxic water damage** (eilutė ~9056, 9090)
   - `playMuffledDamageHit` (muffled sound, tarsi už durų)

## ✅ Testavimas:

1. **Damage Dealt (darome damage):**
   - Šaudote arrow/bullet/projectile į oponentą
   - Turėtumėte išgirsti **satisfying hit sound** (patenkinantis smūgio garsas)
   - Aukštesnis tonas, sharp sound

2. **Damage Received (gauname damage):**
   - Gaunate damage iš oponento
   - Turėtumėte išgirsti **pain/impact sound** (skausmo/impact garsas)
   - Žemesnis tonas, painful sound

3. **Toxic Water:**
   - Patenkate į toxic water
   - Turėtumėte išgirsti **muffled damage sound** (duslesnis garsas)
   - Tarsi už uždarytų durų

## 🎯 Rezultatas:

- **Damage Dealt:** Satisfying hit sound (patenkinantis smūgio garsas)
- **Damage Received:** Pain/impact sound (skausmo/impact garsas)
- **Toxic Water:** Muffled damage sound (duslesnis garsas)
- **Skirtingi garsai** kiekvienam damage tipui

Damage sistema dabar turi **skirtingus garso efektus** kai darote ir gaunate damage!

























