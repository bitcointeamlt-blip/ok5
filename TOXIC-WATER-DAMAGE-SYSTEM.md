# ☠️ Nuodingo Vandens Damage Sistema Pridėta

## ✅ Kas padaryta:

Pridėta nuodingo vandens damage sistema, kur damage prasideda nuo 1 ir kiekvieną sekundę didėja +1.

### Funkcijos:

1. **Toxic water zona:**
   - Zona tarp platformos ir bottom floor (lavaTopY → lavaBottomY)
   - Žalias toxic water su bubliukais

2. **Damage sistema:**
   - **1 sekundė:** -1 dmg
   - **2 sekundės:** -2 dmg
   - **3 sekundės:** -3 dmg
   - **4 sekundės:** -4 dmg
   - **ir taip toliau...**
   - Damage didėja kiekvieną sekundę +1

3. **Damage taikymas:**
   - Damage taikomas kiekvieną sekundę (1000ms)
   - Armor pirmiausia, tada HP
   - Garso efektas kiekvieną kartą
   - Damage number animacija

4. **Tracking sistema:**
   - Seka kiek laiko žaidėjas yra vandenyje
   - Resetuojasi kai žaidėjas išeina iš vandens
   - Damage skaičiuojamas pagal laiką vandenyje

## 🎮 Kaip veikia:

1. **Įėjimas į toxic water:**
   - Žaidėjas patenka į toxic water zoną (tarp platformos ir bottom floor)
   - Prasideda tracking (toxicWaterStartTime)
   - Iš karto taikomas -1 dmg

2. **Buvimas toxic water:**
   - Kiekvieną sekundę taikomas damage
   - Damage = sekundės vandenyje + 1
   - Pvz: 1s = 1 dmg, 2s = 2 dmg, 3s = 3 dmg

3. **Išėjimas iš toxic water:**
   - Tracking resetuojamas
   - Damage sustabdomas
   - Galima vėl įeiti ir damage prasideda nuo 1

## 🔧 Techniniai detalės:

### PvPPlayer interface:
```typescript
toxicWaterStartTime: number | null; // When player entered toxic water (null = not in water)
toxicWaterLastDamageTime: number; // When last toxic water damage was dealt
```

### Damage skaičiavimas:
```typescript
const secondsInWater = Math.floor((now - player.toxicWaterStartTime) / 1000);
const damage = secondsInWater + 1; // 1 sec = 1 dmg, 2 sec = 2 dmg, 3 sec = 3 dmg
```

### Toxic water zona:
```typescript
const lavaTopY = movingPlatformY + movingPlatformThickness; // Platform bottom
const lavaBottomY = bottomFloorY; // Bottom floor
const isInToxicWater = player.y + player.radius >= lavaTopY && 
                       player.y - player.radius <= lavaBottomY;
```

## 📊 Damage progresija:

| Laikas vandenyje | Damage |
|------------------|--------|
| 1 sekundė | -1 dmg |
| 2 sekundės | -2 dmg |
| 3 sekundės | -3 dmg |
| 4 sekundės | -4 dmg |
| 5 sekundžių | -5 dmg |
| 10 sekundžių | -10 dmg |
| 20 sekundžių | -20 dmg |

## ✅ Testavimas:

1. Paleiskite žaidimą lokaliame režime
2. Perjunkite į PvP arba Training mode
3. Nukriste į toxic water zoną (tarp platformos ir bottom floor)
4. Turėtumėte matyti:
   - Iš karto -1 dmg (pirmą sekundę)
   - Po 1 sekundės -2 dmg
   - Po 2 sekundžių -3 dmg
   - Po 3 sekundžių -4 dmg
   - ir taip toliau...
5. Išlipkite iš vandens
6. Vėl įlipkite - damage prasideda nuo 1

## 🎯 Rezultatas:

- **Damage prasideda nuo 1** kai patenkate į toxic water
- **Damage didėja +1 kiekvieną sekundę** (1s = 1 dmg, 2s = 2 dmg, 3s = 3 dmg)
- **Tracking resetuojasi** kai išeinate iš vandens
- **Garso efektas** kiekvieną kartą kai daromas damage

Nuodingo vandens damage sistema dabar veikia su **progresuojančiu damage**!






















