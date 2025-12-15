# 🚀 Jetpack Sistema Pridėta

## ✅ Kas padaryta:

Pridėta jetpack sistema su degalų valdymu PvP/Training mode'e.

### Funkcijos:

1. **SPACE klavišas:**
   - Paspaudus ir laikant SPACE - aktyvuojamas jetpack
   - Paleidus SPACE - deaktyvuojamas jetpack

2. **Greičio boost:**
   - Greitis prasideda nuo +1 ir didėja iki +3 per 3 sekundes
   - Boost taikomas esamai judėjimo krypčiai (krypties keisti negalima)
   - Boost pridedamas ant viršaus esamo greičio

3. **Degalų sistema:**
   - Maksimalus naudojimas: 3 sekundės
   - Degalai baigiasi per 3 sekundes (100 fuel)
   - Nustojus naudoti, degalai pilnai užsipildo per 6 sekundes
   - Degalai regeneruojasi tik nustojus naudoti jetpack

4. **UI rodymas:**
   - Fuel bar (žalias kai neaktyvus, oranžinis kai aktyvus)
   - Fuel procentas
   - Jetpack status (greitis boost)

## 🎮 Kaip veikia:

1. **Aktyvavimas:**
   - Paspaudžiate ir laikote SPACE
   - Jetpack aktyvuojamas (jei yra degalų)
   - Greičio boost prasideda nuo +1

2. **Naudojimas:**
   - Laikant SPACE, greitis didėja nuo +1 iki +3 per 3 sekundes
   - Degalai naudojami (100 fuel per 3 sekundes)
   - Kryptis nekeičiama - judama ta kryptimi kuria jau judėjo

3. **Deaktyvavimas:**
   - Paleidžiate SPACE
   - Jetpack deaktyvuojamas
   - Degalai pradeda regeneruotis (pilnai per 6 sekundes)

4. **Ribotojai:**
   - Maksimalus naudojimas: 3 sekundės (tada automatiškai išsijungia)
   - Jei degalai baigiasi - automatiškai išsijungia
   - Negalima naudoti jei miręs ar paralyžiuotas

## 🔧 Techniniai detalės:

### PvPPlayer interface:
```typescript
fuel: number; // Current fuel (0-100)
maxFuel: number; // Maximum fuel (100)
isUsingJetpack: boolean; // Whether jetpack is currently active
jetpackStartTime: number; // When jetpack was started
lastFuelRegenTime: number; // When fuel was last regenerated
```

### Greičio boost:
- Prasideda nuo +1
- Didėja iki +3 per 3 sekundes
- Taikomas esamai judėjimo krypčiai
- Boost = 1 + (useTime / 3) * 2

### Degalų naudojimas:
- 100 fuel per 3 sekundes
- Fuel consumption rate = 100 / 3 = ~33.33 per second
- Jei fuel <= 0 - automatiškai išsijungia

### Degalų regeneracija:
- Pradeda tik nustojus naudoti jetpack
- Pilnai užsipildo per 6 sekundes
- Regeneration rate = 100 / 6000 = ~0.0167 per millisecond

## 📝 Kodas:

### SPACE keydown handler:
```typescript
if (e.key === ' ' && (gameMode === 'PvP' || gameMode === 'Training') && myPlayerId && pvpPlayers[myPlayerId]) {
  const myPlayer = pvpPlayers[myPlayerId];
  
  // Block if dead or paralyzed
  if (myPlayer.isOut || myPlayer.hp <= 0 || deathAnimations.has(myPlayerId)) return;
  if (myPlayer.paralyzedUntil > Date.now()) return;
  
  // Activate jetpack if has fuel
  if (myPlayer.fuel > 0 && !myPlayer.isUsingJetpack) {
    myPlayer.isUsingJetpack = true;
    myPlayer.jetpackStartTime = Date.now();
  }
}
```

### SPACE keyup handler:
```typescript
if (e.key === ' ' && (gameMode === 'PvP' || gameMode === 'Training') && myPlayerId && pvpPlayers[myPlayerId]) {
  const myPlayer = pvpPlayers[myPlayerId];
  
  // Deactivate jetpack
  if (myPlayer.isUsingJetpack) {
    myPlayer.isUsingJetpack = false;
    myPlayer.lastFuelRegenTime = Date.now(); // Start regeneration
  }
}
```

### Jetpack physics update:
```typescript
if (playerId === myPlayerId && player.isUsingJetpack && player.fuel > 0) {
  const now = Date.now();
  const jetpackUseTime = (now - player.jetpackStartTime) / 1000;
  
  // Check max usage time (3 seconds)
  if (jetpackUseTime >= 3) {
    player.isUsingJetpack = false;
    player.lastFuelRegenTime = now;
  } else {
    // Calculate speed boost (1 to 3)
    const speedBoost = 1 + (jetpackUseTime / 3) * 2;
    
    // Apply boost in current direction
    const currentSpeed = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
    if (currentSpeed > 0.1) {
      const dirX = player.vx / currentSpeed;
      const dirY = player.vy / currentSpeed;
      player.vx += dirX * speedBoost * 0.1;
      player.vy += dirY * speedBoost * 0.1;
    }
    
    // Consume fuel
    const fuelConsumptionRate = 100 / 3;
    const fuelConsumed = (fuelConsumptionRate * (now - player.jetpackStartTime)) / 1000;
    player.fuel = Math.max(0, player.maxFuel - fuelConsumed);
    
    // Auto-deactivate if fuel runs out
    if (player.fuel <= 0) {
      player.isUsingJetpack = false;
      player.lastFuelRegenTime = now;
      player.fuel = 0;
    }
  }
}
```

### Fuel regeneration:
```typescript
if (playerId === myPlayerId && !player.isUsingJetpack && player.fuel < player.maxFuel && player.lastFuelRegenTime > 0) {
  const now = Date.now();
  const timeSinceLastRegen = now - player.lastFuelRegenTime;
  
  const regenRate = 100 / 6000; // Fuel per millisecond
  const fuelRegenerated = regenRate * timeSinceLastRegen;
  player.fuel = Math.min(player.maxFuel, player.fuel + fuelRegenerated);
  
  if (player.fuel < player.maxFuel) {
    player.lastFuelRegenTime = now;
  }
}
```

## ✅ Testavimas:

1. Paleiskite žaidimą lokaliame režime
2. Perjunkite į PvP arba Training mode
3. Paspaudžiate ir laikote SPACE
4. Turėtumėte matyti:
   - Fuel bar keičiasi iš žalio į oranžinį
   - Fuel procentas mažėja
   - Greitis didėja (nuo +1 iki +3)
   - Judama ta kryptimi kuria jau judėjo
5. Paleidžiate SPACE
6. Turėtumėte matyti:
   - Fuel bar keičiasi iš oranžinio į žalią
   - Fuel procentas didėja (pilnai per 6 sekundes)

## 🎨 UI:

- **Fuel bar:** 200px pločio, 12px aukščio
- **Spalva:** Žalias kai neaktyvus, oranžinis kai aktyvus
- **Fuel text:** Rodo procentą (0-100%)
- **Jetpack status:** Rodo greičio boost kai aktyvus

## 📍 Vietos kur pridėta:

1. **PvPPlayer interface** (eilutė ~365)
   - Pridėti fuel laukai

2. **Player inicializavimas** (eilutė ~786)
   - Pridėti fuel inicializavimas

3. **SPACE keydown handler** (eilutė ~7106)
   - Jetpack aktyvavimas

4. **SPACE keyup handler** (eilutė ~7209)
   - Jetpack deaktyvavimas

5. **Physics update** (eilutė ~8848)
   - Jetpack logika ir fuel regeneration

6. **UI render** (eilutė ~2292)
   - Fuel bar ir status rodymas










