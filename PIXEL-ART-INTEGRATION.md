# Pixel Art Integration - Vibeship Skills

## Aprašymas

Integruoti [vibeship pixel art skills](https://spawner.vibeship.co/skills/pixel-art) su PvP online žaidimu, kad pagerintų esamą pixel art stilių.

## Instaliuoti Skills

```bash
npx github:vibeforge1111/vibeship-spawner-skills install --mcp pixel-art
```

## Sukurtas Modulis

**`src/utils/PixelArtEnhancer.ts`** - Pixel art enhancement modulis su šiais principais:

### Funkcijos

1. **`applyEdgeShading()`** - Uniform edge darkening (shading technique)
   - Tamsina visus kraštus vienodai, kad sukurtų gylio efektą
   - Pagrindinis pixel art shading principas

2. **`applyDithering()`** - Ordered dithering su Bayer matrix
   - Sklandžiai perėjimai tarp spalvų
   - Naudoja 4x4 Bayer matricą

3. **`enhanceOutline()`** - Outline enhancement
   - Pagerina sprite kontūrus
   - Prideda subtilią kontūro liniją

4. **`optimizeColorPalette()`** - Color palette optimization
   - Sumažina spalvų kiekį, išlaikant vizualinę kokybę
   - Optimizuoja pixel art spalvų paletę

5. **`enhanceSprite()`** - Pagrindinė funkcija sprite apdorojimui
   - Taiko visus enhancements vienu metu
   - Konfigūruojamas per `PixelArtConfig`

6. **`setupPixelPerfectContext()`** - Pixel-perfect rendering setup
   - Užtikrina, kad `imageSmoothingEnabled = false` visur
   - Palengvina pixel art rendering

## Integracija su Esamu Kodu

### Sprite Processing Funkcijos

Integruota su šiomis sprite processing funkcijomis:

1. **Arrow Sprite** (`loadArrowSprite`)
   - Edge shading: ✅ (intensity: 0.3)
   - Dithering: ❌ (paliekamas crisp)
   - Outline: ❌

2. **Boom Sprite** (`loadBoomSprite`)
   - Edge shading: ✅ (intensity: 0.4)
   - Dithering: ✅ (intensity: 0.25) - padeda su explosion efektais
   - Outline: ❌

3. **Stone Sprite** (`loadStoneSprite`)
   - Edge shading: ✅ (intensity: 0.5)
   - Dithering: ❌ (paliekamas crisp)
   - Outline: ✅ - pagerina stone kontūrus

4. **UFO Sprite** (`loadUfoSprite`)
   - Edge shading: ✅ (intensity: 0.3)
   - Dithering: ❌ (paliekamas crisp)
   - Outline: ❌

### Render Funkcija

Pridėtas `setupPixelPerfectContext(ctx)` render funkcijos pradžioje, kad užtikrintų pixel-perfect rendering visur.

## Pixel Art Principai (iš Vibeship)

1. **Uniform Edge Darkening** - Visi kraštai tamsinami vienodai
2. **Dithering Techniques** - Sklandžios perėjimai tarp spalvų
3. **Subpixel Animation** - `snapToPixel()` funkcija
4. **Color Palette Design** - Optimizuota spalvų paletė
5. **Outline Techniques** - Pagerinti kontūrai
6. **Retro Constraints** - Pixel-perfect rendering

## Naudojimas

### Automatinis

Visi sprites automatiškai apdorojami su pixel art enhancements, kai jie užkraunami.

### Rankinis

Jei reikia rankiniu būdu apdoroti sprite:

```typescript
import { enhanceSprite } from './utils/PixelArtEnhancer';

const enhanced = enhanceSprite(spriteImage, {
  enableEdgeShading: true,
  enableDithering: true,
  enableOutlineEnhancement: true,
  edgeShadingIntensity: 0.4,
  ditheringIntensity: 0.3
});
```

## Konfigūracija

Galima konfigūruoti per `PixelArtConfig`:

```typescript
interface PixelArtConfig {
  enableEdgeShading: boolean;
  enableDithering: boolean;
  enableSubpixelAnimation: boolean;
  enableOutlineEnhancement: boolean;
  ditheringIntensity: number; // 0-1
  edgeShadingIntensity: number; // 0-1
}
```

## Rezultatai

- ✅ Visi sprites dabar naudoja pixel art enhancements
- ✅ Pixel-perfect rendering užtikrintas visur
- ✅ Geresnė vizualinė kokybė su uniform edge shading
- ✅ Dithering pagerina explosion efektus
- ✅ Outline enhancement pagerina stone kontūrus

## Testavimas

Paleiskite žaidimą ir patikrinkite:

1. Arrow sprites - turėtų turėti geresnį shading
2. Boom sprites - turėtų turėti dithering efektus
3. Stone sprites - turėtų turėti pagerintus kontūrus
4. UFO sprites - turėtų turėti geresnį shading

## Nuorodos

- [Vibeship Pixel Art Skills](https://spawner.vibeship.co/skills/pixel-art)
- [Pixel Art Fundamentals](https://spawner.vibeship.co/skills/pixel-art)

