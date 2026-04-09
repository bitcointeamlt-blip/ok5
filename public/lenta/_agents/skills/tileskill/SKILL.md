---
name: tileskill
description: How to implement a Tiled-like multi-tile picker UI and rendering logic for painting arbitrary sprite sheet terrain in the game.
---

# Tilemap Multi-Select Picker Skill

Šis „skill“ (kodavimo įgūdis) aprašo standartizuotą logiką, kaip žaidime sukurti Tiled (žemėlapių redagavimo programos) stiliaus modalinį langą. Jis skirtas dinamiškai nuskaityti bet kokį sprite sheet (tekstūrų žemėlapį), leisti vartotojui pelyte pažymėti atskirą langelį ar ištisą N x M struktūrą, bei nupiešti tą bloką žaidimo lange.

Kai susiduriate su poreikiu sukurti naują interaktyvią tekstūrų paletę („Tile Picker“), sekite šiais architektūros principais:

## 1. UI Modalas su dinamine Drobe (Canvas)

Modalinis langas neturi naudoti „hardcoded“ dimensijų drobėje. Jis turi automatiškai prisitaikyti prie užkrautos nuotraukos originalių išmatavimų, kuriuos gaus iš `image.naturalWidth` ir `image.naturalHeight`.

**HTML struktūra redaktoriui:**
```html
<div id="picker-modal" style="display:none; position:absolute; z-index:9999;">
   <!-- Pavadinimas: -->
   <div id="picker-title">SELECT TILE</div>
   <div style="position:relative;">
       <canvas id="picker-canvas" style="cursor:crosshair;"></canvas>
       <div id="picker-highlight" style="position:absolute; pointer-events:none; display:none; border:2px solid #00ff00;"></div>
   </div>
   <button onclick="document.getElementById('picker-modal').style.display='none'">CLOSE</button>
</div>
```

## 2. Javascript: Picker funkcija su Click+Drag rėžimu

Naudojant parametrą (pvz. `openPicker('elev')`), galime atverti atitinkamo tipo objektų ar žemės detalių sąrašą.
Labai svarbu tinkamai nuskaityti `canvas.getBoundingClientRect()` padėtį, kad `鼠标 -> Drobė` atitiktų realias Tinklelio koordinates ir nesikirstų su CSS „scaled“ dydžiu.

**Kodavimo principas žymėjimui (Click+Drag):**
1. Skaičiuoklė apima `w` ir `h` parametrus nuo x,y (pvz. po 64px Grid'ui).
2. `mousedown` seka pradinį tašką (`startTx`, `startTy`).
3. `mousemove` brėžia `div_highlight` stačiakampį aplink visą plotą (x, y, w, h).
4. `mouseup` priskiria modifikuoto redaktoriaus teptuko tipui kodą (pvz., `"elevgroup_1_1_3_2"`), kur iškoduota: `[tipas]_X_Y_W_H`.

Pavyzdinis sprendimas:
```javascript
  const updateHighlight = () => {
    const minTx = Math.min(startTx, endTx);
    const minTy = Math.min(startTy, endTy);
    const w = Math.max(startTx, endTx) - minTx + 1;
    const h = Math.max(startTy, endTy) - minTy + 1;
    hl.style.left = (minTx * 64) + 'px';
    hl.style.top = (minTy * 64) + 'px';
    hl.style.width = (w * 64) + 'px';
    hl.style.height = (h * 64) + 'px';
  };
```

## 3. Žemėlapio dažymo logika (Painting)

Kai teptukas priskiria `window.editTileType = "elevgroup_1_1_3_2"`, `mousedown` ar trynimo ekrane (ant žaidimo `Canvas`) metu turime tai paversti į objektus žaidimo `S.decorations` medyje struktūroje.

Naudojant „Double-For“ ciklą (W ir H):
```javascript
if (window.editTileType.startsWith('PREFIXgroup_')) {
    const parts = window.editTileType.split('_');
    const pType = parts[0].replace('group', '');
    const pTx = parseInt(parts[1]), pTy = parseInt(parts[2]);
    const pW = parseInt(parts[3]), pH = parseInt(parts[4]);
    for (let dy=0; dy<pH; dy++) {
       for (let dx=0; dx<pW; dx++) {
          if (gy+dy < ROWS && gx+dx < COLS) {
              S.decorations[`${gy+dy},${gx+dx}`] = `${pType}_${pTx+dx}_${pTy+dy}`;
          }
       }
    }
}
```

## 4. Renderinimas (Atvaizdavimas)

Kiekvienam laukeliui, išsaugotam `S.decorations` medyje su atskirtu ID pvz., `elev_2_3`:
Renderinimo fazėje atpažįstame `PREFIX_` raktą.
Iškoduojame `tx` ir `ty` iš rakto. Ir nupiešiame originalią 64x64 atplaišą:

```javascript
  if (decId.startsWith('elev_')) {
    const parts = decId.split('_');
    const tx = parseInt(parts[1], 10);
    const ty = parseInt(parts[2], 10);
    if (elevationImg.complete) {
       ctx.drawImage(elevationImg, tx * GRID_SIZE, ty * GRID_SIZE, GRID_SIZE, GRID_SIZE, px, py, GRID_SIZE, GRID_SIZE);
    }
  }
```

Šis "Skill" leidžia akimirksniu plėsti redaktoriaus funkcionalumą ir nereikalauja atskiro pritaikymo kiekvienam naujam Sprite sheet blokui, net jei paveikslėlio išmatavimai kinta ar žymimi milžiniški, daugelyje celių besidriekiantys struktūriniai blokai (tokie kaip laiptai, didelės uolų sienos, pilys).
