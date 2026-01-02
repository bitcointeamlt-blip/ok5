# 🗑️ Senoji Toxic Water Damage Sistema Pašalinta

## ✅ Kas pakeista:

Pašalinta senoji "out of bounds" damage sistema, kuri darė po 1 dmg kiekvieną sekundę. Dabar lieka tik nauja toxic water sistema su progresuojančiu damage.

### Pakeitimai:

1. **Senoji sistema pašalinta:**
   - **Prieš:** "Out of bounds" sistema darė po 1 dmg kiekvieną sekundę
   - **Dabar:** "Out of bounds" sistema tik seką poziciją (be damage)
   - **Priežastis:** Dabar turime naują toxic water sistemą su progresuojančiu damage

2. **Nauja sistema lieka:**
   - Toxic water sistema su progresuojančiu damage (1s = 1 dmg, 2s = 2 dmg, 3s = 3 dmg)
   - Tikrina ar žaidėjas yra toxic water zonoje (tarp platformos ir bottom floor)
   - Damage didėja kiekvieną sekundę +1

## 🎮 Kaip veikia dabar:

1. **Out of bounds (už ribų):**
   - Tik sekama pozicija (be damage)
   - Naudojama tik mirties animacijai

2. **Toxic water (tarp platformos ir bottom floor):**
   - Progresuojantis damage (1s = 1 dmg, 2s = 2 dmg, 3s = 3 dmg)
   - Damage didėja kiekvieną sekundę +1
   - Tik viena sistema - nauja su progresuojančiu damage

## ✅ Testavimas:

1. Paleiskite žaidimą lokaliame režime
2. Perjunkite į PvP arba Training mode
3. Nukriste į toxic water zoną (tarp platformos ir bottom floor)
4. Turėtumėte matyti:
   - Tik vieną damage sistemą (progresuojantis damage)
   - 1s = 1 dmg, 2s = 2 dmg, 3s = 3 dmg
   - Nebėra senosios sistemos (po 1 dmg kiekvieną sekundę)

## 🎯 Rezultatas:

- **Senoji sistema pašalinta** (out of bounds damage)
- **Liko tik nauja sistema** (toxic water su progresuojančiu damage)
- **Nebėra dubliavimo** - tik viena damage sistema

Toxic water damage sistema dabar veikia **tik su progresuojančiu damage**!






















