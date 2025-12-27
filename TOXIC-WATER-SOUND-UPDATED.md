# 🔊 Toxic Water Garso Efektas Atnaujintas

## ✅ Kas pakeista:

Pašalintas skęsimo garso efektas kai patenkate į vandenį. Dabar lieka tik duslesnis damage garso efektas, kuris groja kai daromas damage esant vandenyje.

### Pakeitimai:

1. **Skęsimo garso efektas pašalintas:**
   - **Prieš:** Grojo skęsimo garso efektas kai patenkate į toxic water
   - **Dabar:** Nebegroja joks garso efektas kai patenkate į vandenį
   - **Priežastis:** Vartotojas norėjo palikti tik damage garso efektą

2. **Duslesnis damage garso efektas lieka:**
   - Groja kai daromas damage toxic water zonoje
   - Muffled sound (tarsi už uždarytų durų)
   - Low-pass filter efektas (600 Hz cutoff)
   - 0.15 sekundės trukmė

## 🎮 Kaip veikia dabar:

1. **Įėjimas į toxic water:**
   - Nebegroja joks garso efektas
   - Iš karto taikomas -1 dmg su duslesniu damage garso efektu

2. **Damage toxic water zonoje:**
   - Kiekvieną sekundę groja duslesnis damage garso efektas
   - Garsas tarsi už uždarytų durų (muffled)
   - Low-pass filter sumažina aukštus tonus

3. **Išėjimas iš toxic water:**
   - Garso efektai sustabdomi
   - Normalūs garso efektai vėl veikia

## ✅ Testavimas:

1. Paleiskite žaidimą lokaliame režime
2. Perjunkite į PvP arba Training mode
3. Nukriste į toxic water zoną (tarp platformos ir bottom floor)
4. Turėtumėte išgirsti:
   - **Nebegroja joks garso efektas** kai patenkate į vandenį
   - **Duslesnį damage garso efektą** kiekvieną sekundę (tarsi už uždarytų durų)
   - Garsas turėtų skambėti dusliau nei normalūs damage garsai
5. Išlipkite iš vandens
6. Normalūs garso efektai vėl veikia

## 🎯 Rezultatas:

- **Skęsimo garso efektas pašalintas** (nebegroja kai patenkate į vandenį)
- **Duslesnis damage garso efektas lieka** (groja kai daromas damage)
- **Tik damage garso efektas** toxic water zonoje

Toxic water zona dabar turi **tik duslesnį damage garso efektą**!















