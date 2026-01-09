# PvP Serverių Pasirinkimo Lentelė - Pixel Art Stilius

## Aprašymas

PvP serverių pasirinkimo lentelė (`drawServerBrowserOverlay()`) buvo perrašyta, kad naudotų pixel art stilių, suderintą su žaidimo UI.

## Pakeitimai

### 1. Pixel Art Rendering
- ✅ Naudojamas `setupPixelPerfectContext()` - užtikrina pixel-perfect rendering
- ✅ Visos koordinatės suapvalinamos su `px()` funkcija
- ✅ Nėra blur efektų - tik crisp pixel art

### 2. UI Komponentai

#### Modal Panel
- Naudojamas `drawPixelPanelFrame()` vietoj paprasto `fillRect()`
- Pixel art rėmas su:
  - Outer frame (tamsus kontūras)
  - Inner frame (šviesus kontūras)
  - Background su UI_PANEL_BG spalva

#### Mygtukai
- **Close Button**: `drawPixelButtonFrame()` su pixel art bevel efektu
- **JOIN Button**: Pixel art mygtukas su hover efektu
- **Server Rows**: Kiekvienas serveris su pixel art rėmu

#### Tekstas
- Naudojamas `drawPixelText()`, `drawPixelTextLeft()`, `drawPixelTextRight()`
- Pixel art tekstas su 1px shadow (be blur)
- "Press Start 2P" fontas visur

### 3. Spalvos

#### UI Spalvos (suderintos su žaidimo stiliumi)
- `UI_PANEL_BG` - modal background
- `UI_BTN_BG` - mygtukų background
- `UI_BTN_OUTER` - tamsus kontūras
- `UI_BTN_INNER` - šviesus kontūras
- `UI_ACCENT_GREEN` - akcentinė žalia (selected/hover)
- `UI_ACCENT_YELLOW` - akcentinė geltona (hover)
- `UI_TEXT` - pagrindinis tekstas
- `UI_TEXT_MUTED` - prislopintas tekstas

#### Status Spalvos
- **Online (ping ≤ 80ms)**: `UI_ACCENT_GREEN` - gerai
- **Online (ping ≤ 140ms)**: `UI_ACCENT_YELLOW` - vidutiniškai
- **Online (ping > 140ms)**: `#ff5500` - aukštas ping
- **Checking**: `UI_ACCENT_YELLOW` - tikrinama
- **Offline**: `#ff1e1e` - nepasiekiamas

### 4. Pixel Art Principai

#### Bevel Efektas
- Top/left: šviesesnė spalva (UI_BTN_BEVEL_LIGHT)
- Bottom/right: tamsesnė spalva (UI_BTN_BEVEL_DARK)
- Sukuria 3D efektą

#### Shadow
- 2px offset shadow (be blur)
- Naudojamas `UI_BTN_SHADOW` spalva
- Tik mygtukams (ne modal panel)

#### Frames
- Outer frame: 1px tamsus kontūras
- Inner frame: 1px šviesus kontūras
- Integer-aligned koordinatės

## Kodo Struktūra

```typescript
function drawServerBrowserOverlay() {
  // 1. Setup pixel-perfect context
  setupPixelPerfectContext(ctx);
  
  // 2. Dark overlay (pixel art - no blur)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 3. Modal panel (pixel art frame)
  const modalFrame = drawPixelPanelFrame(...);

  // 4. Title (pixel art text)
  drawPixelTextLeft(...);

  // 5. Close button (pixel art button)
  const closeFrame = drawPixelButtonFrame(...);

  // 6. Server rows (pixel art frames)
  serverStatuses.forEach((server) => {
    const rowFrame = drawPixelButtonFrame(...);
    drawPixelTextLeft(...); // Server name
    drawPixelTextRight(...); // Status
    const joinButton = drawPixelButtonFrame(...); // JOIN button
  });
}
```

## Vizualiniai Pagerinimai

### Prieš
- ❌ Smooth rendering (blur)
- ❌ Paprasti rėmai be bevel
- ❌ Nesuderintos spalvos
- ❌ Standartinis tekstas be shadow

### Po
- ✅ Pixel-perfect rendering
- ✅ Pixel art rėmai su bevel efektu
- ✅ Suderintos spalvos su žaidimo stiliumi
- ✅ Pixel art tekstas su shadow
- ✅ Hover efektai su accent spalvomis
- ✅ Selected state su green accent

## Funkcijos

### Naudojamos Funkcijos
- `setupPixelPerfectContext()` - pixel-perfect rendering setup
- `px()` - koordinačių suapvalinimas
- `drawPixelPanelFrame()` - modal panel piešimas
- `drawPixelButtonFrame()` - mygtukų piešimas
- `drawPixelText()` - centruoto teksto piešimas
- `drawPixelTextLeft()` - kairiojo teksto piešimas
- `drawPixelTextRight()` - dešiniojo teksto piešimas

### UI Konstantos
- `UI_PANEL_BG` - panel background
- `UI_BTN_BG` - button background
- `UI_BTN_OUTER` - outer frame
- `UI_BTN_INNER` - inner frame
- `UI_ACCENT_GREEN` - green accent
- `UI_ACCENT_YELLOW` - yellow accent
- `UI_TEXT` - text color
- `UI_TEXT_MUTED` - muted text color

## Rezultatai

✅ PvP serverių pasirinkimo lentelė dabar visiškai suderinta su žaidimo pixel art stiliumi
✅ Naudojami tie patys UI komponentai kaip ir visame žaidime
✅ Pixel-perfect rendering užtikrintas
✅ Hover ir selected state efektai su accent spalvomis
✅ Profesionalus pixel art išvaizda

## Testavimas

Paleiskite žaidimą ir:
1. Paspaudžiate "PvP ONLINE" mygtuką
2. Turėtumėte matyti pixel art stiliaus serverių pasirinkimo lentelę
3. Hover ant serverių turėtų rodyti accent spalvas
4. Selected serveris turėtų būti pažymėtas green accent
5. JOIN mygtukas turėtų turėti pixel art stilių

