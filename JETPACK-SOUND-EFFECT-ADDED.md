# 🔊 Jetpack Garso Efektas Pridėtas

## ✅ Kas padaryta:

Pridėtas tęstinis garso efektas jetpack naudojimui - lengvas "snipstimas" (whistling/hissing), kuris stiprėja iki perdegimo fazės.

### Funkcijos:

1. **Tęstinis garso efektas:**
   - Prasideda kai aktyvuojamas jetpack
   - Tęsiasi tol kol naudojami degalai
   - Sustabdomas kai jetpack deaktyvuojamas arba prasideda perkaitimas

2. **Garso stiprumas pagal degalų kiekį:**
   - **Pradžioje (100% degalų):** Lengvas, tylus "snipstimas" (800 Hz, 8% volume)
   - **Viduryje (50% degalų):** Vidutinis stiprumas (1000 Hz, 14% volume)
   - **Prieš perdegimą (0% degalų):** Stiprus, intensyvus (1200 Hz, 20% volume)
   - **Stiprėja:** Kuo mažiau degalų, tuo aukštesnis tonas ir garsesnis

3. **Perkaitimo garso efektas:**
   - Kai degalai pasiekia 0% - groja perkaitimo garso efektas
   - Intensyvus įspėjimo garsas (600→800 Hz, 25% volume)
   - Trumpas (0.3 sekundės)

## 🎮 Kaip veikia:

1. **Aktyvavimas:**
   - Paspaudžiate ir laikote SPACE
   - Jetpack aktyvuojamas
   - Prasideda lengvas "snipstimas" (800 Hz, 8% volume)

2. **Naudojimas:**
   - Garso efektas tęsiasi tol kol naudojami degalai
   - Garso efektas stiprėja pagal degalų kiekį:
     - Kuo mažiau degalų, tuo aukštesnis tonas (800→1200 Hz)
     - Kuo mažiau degalų, tuo garsesnis (8%→20% volume)
   - Garso efektas atnaujinamas kiekviename frame'e

3. **Deaktyvavimas:**
   - Paleidžiate SPACE
   - Jetpack deaktyvuojamas
   - Garso efektas sustabdomas (smooth fade out)

4. **Perkaitimas:**
   - Kai degalai pasiekia 0%
   - Jetpack garso efektas sustabdomas
   - Groja perkaitimo garso efektas (intensyvus įspėjimo garsas)

## 🔧 Techniniai detalės:

### Garso parametrai:

**Jetpack naudojimas:**
- **Frequency:** 800→1200 Hz (pagal degalų kiekį)
- **Type:** Sine wave (smooth whistling)
- **Volume:** 8%→20% (pagal degalų kiekį)
- **Tęstinis:** Groja tol kol naudojami degalai

**Perkaitimas:**
- **Frequency:** 600→800 Hz (intensyvus)
- **Type:** Square + Sawtooth (harsh warning)
- **Volume:** 25%
- **Duration:** 0.3 sekundės

### Kodas:

```typescript
// Start jetpack sound
startJetpackSound(fuelPercent: number): void {
  // Create oscillator for continuous whistling/hissing sound
  // Frequency: 800 + (1 - fuelPercent) * 400 (800→1200 Hz)
  // Volume: 0.08 + (1 - fuelPercent) * 0.12 (8%→20%)
}

// Update jetpack sound
updateJetpackSound(fuelPercent: number): void {
  // Update frequency and volume based on fuel level
  // Higher frequency and volume = less fuel
}

// Stop jetpack sound
stopJetpackSound(): void {
  // Fade out smoothly and stop oscillator
}

// Play overheat sound
playOverheatSound(): void {
  // Intense warning sound (600→800 Hz, 0.3s)
}
```

## ✅ Testavimas:

1. Paleiskite žaidimą lokaliame režime
2. Perjunkite į PvP arba Training mode
3. Paspaudžiate ir laikote SPACE
4. Turėtumėte išgirsti:
   - Lengvas "snipstimas" (whistling/hissing)
   - Garso efektas stiprėja kai degalai mažėja
   - Aukštesnis tonas ir garsesnis kai degalai artėja prie 0%
5. Paleidžiate SPACE
6. Garso efektas turėtų sustoti (smooth fade out)
7. Jei naudojate iki 0%:
   - Jetpack garso efektas sustabdomas
   - Groja perkaitimo garso efektas (intensyvus įspėjimo garsas)

## 🎯 Rezultatas:

- **Tęstinis garso efektas** kai naudojami degalai
- **Stiprėja pagal degalų kiekį** (kuo mažiau degalų, tuo stipresnis)
- **Perkaitimo garso efektas** kai degalai pasiekia 0%
- **Smooth fade out** kai jetpack deaktyvuojamas

Jetpack sistema dabar turi **garso efektą**, kuris aiškiai rodo degalų būseną!
























