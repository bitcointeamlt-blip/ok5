# 🔥 Jetpack Perkaitimo Sistema Pridėta

## ✅ Kas padaryta:

Pridėta perkaitimo sistema, kad jetpack būtų subalansuotas ir turėtų riziką.

### Funkcijos:

1. **Perkaitimo aktyvavimas:**
   - Kai degalai pasiekia 0% - prasideda perkaitimas
   - Perkaitimas trunka 2 sekundes
   - Perkaitimo metu negalima naudoti jetpack

2. **Degalų regeneracija:**
   - Perkaitimo metu degalai **neatsistatina** (2 sekundžių pause)
   - Po perkaitimo (2 sekundės) degalai pradeda atsistatinti
   - Degalai atsistatina pilnai per 6 sekundes (po perkaitimo)

3. **Vizualinis efektas:**
   - Fuel bar tampa raudonas perkaitimo metu
   - Pulsing raudonas glow efektas
   - Raudonas border
   - "OVERHEAT: X.Xs" tekstas

## 🎮 Kaip veikia:

1. **Normalus naudojimas:**
   - Paspaudžiate ir laikote SPACE
   - Jetpack aktyvuojamas (jei yra degalų)
   - Degalai naudojami (50 fuel per 1.5 sekundes)

2. **Degalų pasiekimas 0%:**
   - Jetpack automatiškai išsijungia
   - Prasideda perkaitimas (2 sekundės)
   - Fuel bar tampa raudonas
   - Pulsing raudonas glow efektas

3. **Perkaitimo metu:**
   - Negalima naudoti jetpack (SPACE neveikia)
   - Degalai **neatsistatina** (2 sekundžių pause)
   - Raudonas fuel bar su pulsing efektu
   - "OVERHEAT: X.Xs" tekstas

4. **Po perkaitimo:**
   - Perkaitimas baigiasi (po 2 sekundžių)
   - Degalai pradeda atsistatinti (pilnai per 6 sekundes)
   - Fuel bar tampa žalias
   - Galima vėl naudoti jetpack

## 🔧 Techniniai detalės:

### PvPPlayer interface:
```typescript
isOverheated: boolean; // Whether jetpack is overheated
overheatStartTime: number; // When overheat started (for 2 second duration)
```

### Perkaitimo logika:
```typescript
// If fuel runs out, start overheat
if (player.fuel <= 0) {
  player.isUsingJetpack = false;
  player.fuel = 0;
  player.isOverheated = true;
  player.overheatStartTime = now;
  player.lastFuelRegenTime = now; // Reset regen time for after overheat
}

// Overheat system
if (player.isOverheated) {
  const overheatDuration = (now - player.overheatStartTime) / 1000;
  const overheatTime = 2; // 2 seconds overheat
  
  if (overheatDuration >= overheatTime) {
    // Overheat finished - start fuel regeneration
    player.isOverheated = false;
    player.overheatStartTime = 0;
    player.lastFuelRegenTime = now; // Start regeneration now
  }
}
```

### Degalų regeneracija:
```typescript
// Fuel regeneration (only when not using jetpack, not overheated, and regeneration has started)
if (!player.isUsingJetpack && !player.isOverheated && player.fuel < player.maxFuel && player.lastFuelRegenTime > 0) {
  // Regenerate fuel (fully in 6 seconds)
}
```

### Vizualinis efektas:
```typescript
// Fuel bar fill - red when overheated
if (myPlayer.isOverheated) {
  fuelBarColor = '#ff0000'; // Red
}

// Overheat effect - pulsing red glow
if (myPlayer.isOverheated) {
  const pulse = Math.sin(overheatDuration * Math.PI * 4) * 0.3 + 0.7;
  ctx.fillStyle = `rgba(255, 0, 0, ${pulse * 0.3})`;
  // Draw pulsing glow
}

// Overheat status text
if (myPlayer.isOverheated) {
  const remainingTime = Math.max(0, 2 - overheatDuration);
  ctx.fillText(`OVERHEAT: ${remainingTime.toFixed(1)}s`, ...);
}
```

## 📊 Perkaitimo ciklas:

1. **Naudojimas:** Degalai naudojami (50 fuel per 1.5s)
2. **Degalų pasiekimas 0%:** Prasideda perkaitimas (2s)
3. **Perkaitimas:** Degalai neatsistatina (2s pause)
4. **Po perkaitimo:** Degalai pradeda atsistatinti (pilnai per 6s)
5. **Galima vėl naudoti:** Kai degalai > 0%

## ✅ Testavimas:

1. Paleiskite žaidimą lokaliame režime
2. Perjunkite į PvP arba Training mode
3. Paspaudžiate ir laikote SPACE iki degalų pasiekimo 0%
4. Turėtumėte matyti:
   - Fuel bar tampa raudonas
   - Pulsing raudonas glow efektas
   - "OVERHEAT: 2.0s" tekstas
   - SPACE neveikia (negali naudoti jetpack)
5. Laukite 2 sekundes
6. Turėtumėte matyti:
   - Fuel bar tampa žalias
   - Degalai pradeda atsistatinti
   - Galima vėl naudoti jetpack

## 🎯 Rezultatas:

- Jetpack dabar turi **perkaitimo riziką**
- Jei naudojate iki 0% - turite laukti 2 sekundes
- Perkaitimo metu degalai **neatsistatina** (2s pause)
- Po perkaitimo degalai atsistatina pilnai per 6 sekundes
- Vizualinis efektas aiškiai rodo perkaitimo būseną

Jetpack sistema dabar yra **subalansuota** su perkaitimo rizika!










