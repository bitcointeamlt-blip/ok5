# 🔴 Raudoni Partikliai Pridėti Mirties Animacijai

## ✅ Kas padaryta:

Pridėta 10 raudonų partiklių ant mirties animacijos, kad ji atrodytų geriau.

### Pakeitimai:

1. **Pridėti 10 raudonų partiklių:**
   - Raudoni partikliai (`#ff0000`) pridedami ant viršaus
   - Jie yra šiek tiek didesni nei įprasti partikliai
   - Jie skrenda greičiau ir aukščiau (daugiau upward bias)
   - Jie yra šiek tiek aukščiau centro (ant viršaus)

2. **Parametrai:**
   - **Kiekis:** 10 raudonų partiklių
   - **Spalva:** `#ff0000` (raudona)
   - **Dydis:** 4-10 pikselių (šiek tiek didesni nei įprasti)
   - **Greitis:** 4-10 (greitesni nei įprasti 3-8)
   - **Upward bias:** -3 (daugiau aukštyn nei įprasti -2)
   - **Pozicija:** Šiek tiek aukščiau centro (y - radius * 0.3)
   - **Rotacija:** Greitesnė (0.2 vs 0.15)

## 🎮 Kaip veikia:

1. Kai žaidėjas miršta (HP <= 0)
2. Sukuriama mirties animacija su 30 įprastų partiklių (juodų)
3. Papildomai pridedama 10 raudonų partiklių ant viršaus
4. Raudoni partikliai skrenda greičiau ir aukščiau
5. Visi partikliai (juodi + raudoni) išsisklaido ir išnyksta per 1.5 sekundės

## 🔧 Techniniai detalės:

- Raudoni partikliai pridedami po įprastų partiklių sukūrimo
- Jie naudoja tą pačią `DeathParticle` struktūrą
- Jie turi tą patį `deathAnimationDuration` (1500ms)
- Jie atnaujinami ir piešiami kartu su įprastais partikliais
- Jie turi tą patį gravity ir fade out efektą

## 📝 Kodas:

```typescript
// Add 10 red particles on top for better visual effect
const redParticleCount = 10;
for (let i = 0; i < redParticleCount; i++) {
  // Random position within the player circle (slightly above center)
  const angle = Math.random() * Math.PI * 2;
  const distance = Math.random() * radius * 0.8; // Slightly closer to center
  const px = x + Math.cos(angle) * distance;
  const py = y + Math.sin(angle) * distance - radius * 0.3; // Slightly above center
  
  // Random velocity - particles fly outward and upward
  const speed = 4 + Math.random() * 6; // Faster than regular particles
  const vAngle = angle + (Math.random() - 0.5) * 1.0; // More spread
  const vx = Math.cos(vAngle) * speed;
  const vy = Math.sin(vAngle) * speed - 3; // More upward bias
  
  // Random particle size within range (slightly larger)
  const particleSize = minParticleSize + Math.random() * (maxParticleSize - minParticleSize + 2);
  
  particles.push({
    x: px,
    y: py,
    vx: vx,
    vy: vy,
    life: deathAnimationDuration,
    maxLife: deathAnimationDuration,
    size: particleSize,
    color: '#ff0000', // Red color
    rotation: Math.random() * Math.PI * 2,
    rotationSpeed: (Math.random() - 0.5) * 0.2 // Faster rotation
  });
}
```

## ✅ Testavimas:

1. Paleiskite žaidimą lokaliame režime
2. Perjunkite į PvP arba Training mode
3. Nukentėkite iki mirties (HP <= 0)
4. Turėtumėte matyti mirties animaciją su:
   - 30 juodų partiklių (įprasti)
   - 10 raudonų partiklių ant viršaus (nauji)
5. Raudoni partikliai turėtų skristi greičiau ir aukščiau

## 🎨 Vizualinis efektas:

- **Prieš:** Tik juodi partikliai
- **Dabar:** Juodi partikliai + 10 raudonų partiklių ant viršaus
- **Rezultatas:** Geresnė vizualinė mirties animacija su raudonais partikliais



