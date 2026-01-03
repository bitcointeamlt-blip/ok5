# ⚡ Jetpack Garso Efektas Atnaujintas - Energijos Naudojimas

## ✅ Kas pakeista:

Jetpack garso efektas pakeistas iš svilpimo į energijos naudojimo garsą su "blinkst" efektu.

### Pakeitimai:

1. **Energijos bazės garsas:**
   - **Prieš:** Svilpimas (900→1400 Hz, sine wave)
   - **Dabar:** Energijos bazės garsas (400→600 Hz, sawtooth wave)
   - **Efektas:** Tarsi naudojama energija, nebe svilpimas

2. **"Blinkst" efektas:**
   - **Pridėta:** Aukštesnio tono energijos efektas (1200→1800 Hz, square wave)
   - **Efektas:** Tarsi energija "blesta" (blink/blinkst)
   - **Kombinacija:** Dvi osciliatoriai sukuria energijos naudojimo garsą

3. **Low-pass filter:**
   - **Pridėta:** Low-pass filter (2000 Hz cutoff)
   - **Efektas:** Sumažina per aukštus tonus, sukuria energijos garsą

## 🎮 Kaip veikia dabar:

1. **Aktyvavimas:**
   - Paspaudžiate ir laikote SPACE
   - Jetpack aktyvuojamas
   - Prasideda energijos naudojimo garsas (400 Hz bazė + 1200 Hz blinkst)

2. **Naudojimas:**
   - Garso efektas tęsiasi tol kol naudojami degalai
   - Garso efektas stiprėja pagal degalų kiekį:
     - Kuo mažiau degalų, tuo aukštesnis tonas (400→600 Hz bazė, 1200→1800 Hz blinkst)
     - Kuo mažiau degalų, tuo garsesnis (10%→22% volume)
   - Garso efektas atnaujinamas kiekviename frame'e

3. **Deaktyvavimas:**
   - Paleidžiate SPACE
   - Jetpack deaktyvuojamas
   - Garso efektas sustabdomas (smooth fade out)

## 🔧 Techniniai detalės:

### Garso parametrai:

**Energijos bazės garsas:**
- **Frequency:** 400→600 Hz (pagal degalų kiekį)
- **Type:** Sawtooth wave (energijos/elektros garsas)
- **Efektas:** Tarsi naudojama energija

**"Blinkst" efektas:**
- **Frequency:** 1200→1800 Hz (pagal degalų kiekį)
- **Type:** Square wave (sharp blinkst efektas)
- **Efektas:** Tarsi energija "blesta" (blink/blinkst)

**Low-pass filter:**
- **Cutoff:** 2000 Hz
- **Efektas:** Sumažina per aukštus tonus, sukuria energijos garsą

**Volume:**
- **Base:** 10% (pradžioje)
- **Max:** 22% (prieš perdegimą)
- **Stiprėja:** Kuo mažiau degalų, tuo garsesnis

## 📊 Palyginimas:

| Parametras | Prieš (Svilpimas) | Dabar (Energija) |
|------------|-------------------|------------------|
| Base Frequency | 900→1400 Hz | 400→600 Hz |
| Blinkst Frequency | Nėra | 1200→1800 Hz |
| Type | Sine | Sawtooth + Square |
| Filter | None | Low-pass 2000 Hz |
| Volume | 12%→28% | 10%→22% |
| Efektas | Svilpimas | Energijos naudojimas |

## ✅ Testavimas:

1. Paleiskite žaidimą lokaliame režime
2. Perjunkite į PvP arba Training mode
3. Paspaudžiate ir laikote SPACE
4. Turėtumėte išgirsti:
   - **Energijos naudojimo garsą** (nebe svilpimas)
   - **"Blinkst" efektą** (tarsi energija blesta)
   - Garso efektas stiprėja kai degalai mažėja
   - Aukštesnis tonas ir garsesnis kai degalai artėja prie 0%
5. Paleidžiate SPACE
6. Garso efektas turėtų sustoti (smooth fade out)

## 🎯 Rezultatas:

- **Energijos naudojimo garsas** (nebe svilpimas)
- **"Blinkst" efektas** (tarsi energija blesta)
- **Dvi osciliatoriai** sukuria turtingesnį energijos garsą
- **Low-pass filter** sukuria energijos atmosferą

Jetpack garso efektas dabar skamba kaip **energijos naudojimas su "blinkst" efektu**!























