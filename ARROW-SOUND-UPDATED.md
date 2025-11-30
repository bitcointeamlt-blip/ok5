# 🔊 Strėlės Garso Efektas Atnaujintas

## ✅ Kas pakeista:

### Problema:
- Strėlės garsas buvo labai panašus į atsokimo garsą
- Abu naudojo sine wave ir panašų frequency sweep

### Sprendimas:
Pakeistas strėlės garso efektas, kad skambėtų kitaip:

**Nauji parametrai:**
- **Dvi osciliatoriai** (kaip bullet ir projectile) - turtingesnis garsas
- **Aukštesnis tonas:**
  - Osc1: 1200→500 Hz (aukštesnis nei bounce 600→300)
  - Osc2: 1000→400 Hz (airy tail)
- **Square wave pagrindinis** (aštrus, skirtingas nuo bounce sine)
- **Sine wave antrasis** (airy tail)
- **Ilgumas:** 250ms (liko tas pats - patinka)

## 🎵 Palyginimas:

### Bounce (atsokimas):
- 600→300 Hz
- Sine wave
- 120ms
- Vienas osciliatorius

### Arrow (strėlė) - NAUJAS:
- 1200→500 Hz + 1000→400 Hz
- Square + Sine wave
- 250ms
- Du osciliatoriai

## ✅ Rezultatas:

Dabar strėlės garsas:
- ✅ Aukštesnis tonas (1200 Hz vs 600 Hz)
- ✅ Aštrus (square wave vs sine)
- ✅ Turtingesnis (du osciliatoriai)
- ✅ Labai skirtingas nuo atsokimo garsą
- ✅ Ilgumas liko tas pats (250ms)

## 🎮 Testavimas:

1. Paleiskite žaidimą
2. Paspaudžiate "1" ir šaudote strėlę
3. Turėtumėte išgirsti aukštesnį, aštresnį garsą
4. Bandykite atsokti nuo platformos - garsai turėtų skambėti skirtingai



