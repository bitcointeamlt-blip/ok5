# 🎮 Itch.io Įkėlimo Instrukcijos

## ✅ Paruošta:

1. **ZIP failas:** `game-build.zip` - paruoštas su visais reikalingais failais
2. **index.html** - yra ZIP root lygyje ✅
3. **Visi sprite failai** - įtraukti ✅
4. **JavaScript moduliai** - santykiniais keliais ✅

---

## 📤 Kaip Įkelti į Itch.io:

### 1. Eikite į Itch.io

1. Prisijunkite prie [itch.io](https://itch.io)
2. Spauskite **"Create a new game"** arba **"New Game"**

### 2. Pasirinkite Projektą

1. **"Kind of project"** → Pasirinkite: **"HTML — You have a ZIP or HTML file that will be played in the browser"**

### 3. Įkelkite ZIP Failą

1. Eikite į **"Uploads"** sekciją
2. Spauskite **"Upload"** arba vilkite `game-build.zip` failą
3. Palaukite kol failas įsikels

### 4. Užpildykite Informaciją

**Frame options:**
- ✅ **Automatically start on page load** - pažymėkite
- ✅ **Fullscreen button** - galite pažymėti (patogiau)
- ❌ **Mobile friendly** - nepažymėkite (žaidimas nėra optimizuotas)
- ❌ **Enable scrollbars** - nepažymėkite
- ❌ **SharedArrayBuffer support** - nepažymėkite

**Details - Description:**
```
PewPew PvP - Multiplayer Space Combat Game

Engage in intense PvP battles in space! Control your UFO and compete against other players in real-time combat.

Features:
• Solo Training Mode - Practice against AI opponents
• Online PvP Mode - Battle real players worldwide
• Wallet Integration - Connect with Ronin or MetaMask
• NFT Bonuses - Collect Ronkeverse NFTs for stat boosts
• Multiple Weapons - Arrows, bombs, bullets, and more
• Turn-based Combat - Strategic PvP matches
• Leaderboard System - Climb the ranks

Craft UFO tickets with 200 $Ronke tokens to enter competitive matches!
```

**Genre:**
- Pasirinkite: **Action** arba **Multiplayer** arba **Shooter**

**Tags:**
- `PvP`
- `Multiplayer`
- `Space`
- `Combat`
- `Action`
- `Web3` (jei yra)
- `NFT` (jei yra)

### 5. Išsaugokite ir Paskelbkite

1. Spauskite **"Save"** arba **"Save & view page"**
2. Spauskite **"View page"** kad pamatytumėte kaip atrodo
3. Jei viskas gerai, spauskite **"Public"** kad paskelbtumėte

---

## ⚠️ Svarbu:

- **Itch.io automatiškai tarnauja failus per HTTP**, todėl žaidimas turėtų veikti be problemų
- Jei žaidimas neveikia, patikrinkite naršyklės console (F12) - ten bus matomi error'ai
- **PvP funkcionalumas** gali neveikti, jei Colyseus serveris nėra pasiekiamas (bet Solo mode turėtų veikti)

---

## 🔍 Troubleshooting:

### Jei žaidimas neveikia:

1. **Patikrinkite naršyklės console (F12)**
   - Jei matote CORS error'us - tai normalus, jei Colyseus serveris nepasiekiamas
   - Jei matote "Failed to load module" - patikrinkite ar visi failai ZIP'e

2. **Patikrinkite ar index.html yra ZIP root lygyje**
   - ZIP struktūra turėtų būti:
     ```
     game-build.zip
     ├── index.html
     ├── assets/
     │   ├── index-xxx.js
     │   └── target-xxx.png
     ├── sprite.arrow.png
     ├── sprite.boom.png
     └── ... (kiti failai)
     ```

3. **Jei vis dar neveikia:**
   - Patikrinkite ar visi sprite failai yra ZIP'e
   - Patikrinkite ar JavaScript failas yra `assets/` aplanke

---

## ✅ Paruošta:

- `game-build.zip` - paruoštas įkėlimui
- Visi failai su santykiniais keliais
- index.html ZIP root lygyje

**Dabar galite įkelti `game-build.zip` į itch.io!** 🚀

