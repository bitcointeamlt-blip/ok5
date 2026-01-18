/**
 * Pixel Art Enhancement Module
 * Integrates vibeship pixel art skills with the game
 * Based on: https://spawner.vibeship.co/skills/pixel-art
 * 
 * Skills covered:
 * - Uniform edge darkening (shading)
 * - Dithering techniques
 * - Subpixel animation
 * - Color palette optimization
 * - Outline techniques
 * - Retro constraints
 */

export interface PixelArtConfig {
  enableEdgeShading: boolean;
  enableDithering: boolean;
  enableSubpixelAnimation: boolean;
  enableOutlineEnhancement: boolean;
  ditheringIntensity: number; // 0-1
  edgeShadingIntensity: number; // 0-1
}

const DEFAULT_CONFIG: PixelArtConfig = {
  enableEdgeShading: true,
  enableDithering: true,
  enableSubpixelAnimation: true,
  enableOutlineEnhancement: true,
  ditheringIntensity: 0.3,
  edgeShadingIntensity: 0.4,
};

/**
 * Apply uniform edge darkening to a sprite (pixel art shading technique)
 * Darkens all edges uniformly to create depth
 */
export function applyEdgeShading(
  canvas: HTMLCanvasElement,
  intensity: number = DEFAULT_CONFIG.edgeShadingIntensity
): HTMLCanvasElement {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const width = canvas.width;
  const height = canvas.height;

  // Create output canvas
  const output = document.createElement('canvas');
  output.width = width;
  output.height = height;
  const outputCtx = output.getContext('2d', { willReadFrequently: true })!;
  const outputData = outputCtx.createImageData(width, height);
  const outputPixels = outputData.data;

  // Copy original
  for (let i = 0; i < data.length; i++) {
    outputPixels[i] = data[i];
  }

  // Apply edge darkening
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      const alpha = data[idx + 3];

      if (alpha > 0) {
        // Check 8 neighbors
        let edgeCount = 0;
        const neighbors = [
          [-1, -1], [0, -1], [1, -1],
          [-1, 0],           [1, 0],
          [-1, 1],  [0, 1],  [1, 1]
        ];

        for (const [dx, dy] of neighbors) {
          const nIdx = ((y + dy) * width + (x + dx)) * 4;
          if (data[nIdx + 3] === 0) {
            edgeCount++;
          }
        }

        if (edgeCount > 0) {
          // Darken edge pixels uniformly
          const darkenFactor = 1 - (intensity * (edgeCount / 8));
          outputPixels[idx] = Math.max(0, Math.floor(data[idx] * darkenFactor));
          outputPixels[idx + 1] = Math.max(0, Math.floor(data[idx + 1] * darkenFactor));
          outputPixels[idx + 2] = Math.max(0, Math.floor(data[idx + 2] * darkenFactor));
        }
      }
    }
  }

  outputCtx.putImageData(outputData, 0, 0);
  return output;
}

/**
 * Apply ordered dithering to smooth color transitions
 * Uses Bayer matrix for pixel art dithering
 */
export function applyDithering(
  canvas: HTMLCanvasElement,
  intensity: number = DEFAULT_CONFIG.ditheringIntensity
): HTMLCanvasElement {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const width = canvas.width;
  const height = canvas.height;

  // 4x4 Bayer matrix for ordered dithering
  const bayerMatrix = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5]
  ];

  const output = document.createElement('canvas');
  output.width = width;
  output.height = height;
  const outputCtx = output.getContext('2d', { willReadFrequently: true })!;
  const outputData = outputCtx.createImageData(width, height);
  const outputPixels = outputData.data;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const bayerValue = bayerMatrix[y % 4][x % 4] / 16;
      const threshold = (bayerValue - 0.5) * intensity;

      // Apply dithering to RGB channels
      for (let c = 0; c < 3; c++) {
        const value = data[idx + c];
        const dithered = Math.max(0, Math.min(255, value + threshold * 255));
        outputPixels[idx + c] = Math.floor(dithered);
      }
      outputPixels[idx + 3] = data[idx + 3]; // Preserve alpha
    }
  }

  outputCtx.putImageData(outputData, 0, 0);
  return output;
}

/**
 * Enhance outlines for better pixel art definition
 * Adds subtle outline to improve visibility
 */
export function enhanceOutline(
  canvas: HTMLCanvasElement,
  outlineColor: string = '#000000',
  outlineWidth: number = 1
): HTMLCanvasElement {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const width = canvas.width;
  const height = canvas.height;

  const output = document.createElement('canvas');
  output.width = width;
  output.height = height;
  const outputCtx = output.getContext('2d', { willReadFrequently: true })!;
  const outputData = outputCtx.createImageData(width, height);
  const outputPixels = outputData.data;

  // Parse outline color
  const colorMatch = outlineColor.match(/#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
  const outlineR = colorMatch ? parseInt(colorMatch[1], 16) : 0;
  const outlineG = colorMatch ? parseInt(colorMatch[2], 16) : 0;
  const outlineB = colorMatch ? parseInt(colorMatch[3], 16) : 0;

  // Copy original
  for (let i = 0; i < data.length; i++) {
    outputPixels[i] = data[i];
  }

  // Add outline to transparent edges
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const alpha = data[idx + 3];

      if (alpha === 0) {
        // Check if any neighbor has alpha
        const neighbors = [
          [-1, -1], [0, -1], [1, -1],
          [-1, 0],           [1, 0],
          [-1, 1],  [0, 1],  [1, 1]
        ];

        for (const [dx, dy] of neighbors) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const nIdx = (ny * width + nx) * 4;
            if (data[nIdx + 3] > 0) {
              // This pixel is on the edge, add outline
              outputPixels[idx] = outlineR;
              outputPixels[idx + 1] = outlineG;
              outputPixels[idx + 2] = outlineB;
              outputPixels[idx + 3] = 128; // Semi-transparent outline
              break;
            }
          }
        }
      }
    }
  }

  outputCtx.putImageData(outputData, 0, 0);
  return output;
}

/**
 * Optimize color palette for pixel art
 * Reduces color count while maintaining visual quality
 */
export function optimizeColorPalette(
  canvas: HTMLCanvasElement,
  maxColors: number = 256
): HTMLCanvasElement {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const width = canvas.width;
  const height = canvas.height;

  // Collect unique colors
  const colorMap = new Map<string, number>();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 0) {
      const key = `${data[i]},${data[i + 1]},${data[i + 2]}`;
      colorMap.set(key, (colorMap.get(key) || 0) + 1);
    }
  }

  // If colors exceed max, quantize
  if (colorMap.size > maxColors) {
    const quantizeStep = Math.ceil(256 / Math.sqrt(maxColors));
    
    const output = document.createElement('canvas');
    output.width = width;
    output.height = height;
    const outputCtx = output.getContext('2d', { willReadFrequently: true })!;
    const outputData = outputCtx.createImageData(width, height);
    const outputPixels = outputData.data;

    for (let i = 0; i < data.length; i += 4) {
      outputPixels[i] = Math.floor(data[i] / quantizeStep) * quantizeStep;
      outputPixels[i + 1] = Math.floor(data[i + 1] / quantizeStep) * quantizeStep;
      outputPixels[i + 2] = Math.floor(data[i + 2] / quantizeStep) * quantizeStep;
      outputPixels[i + 3] = data[i + 3];
    }

    outputCtx.putImageData(outputData, 0, 0);
    return output;
  }

  return canvas;
}

/**
 * Process sprite with pixel art enhancements
 */
export function enhanceSprite(
  sprite: HTMLImageElement | HTMLCanvasElement,
  config: Partial<PixelArtConfig> = {}
): HTMLCanvasElement {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  
  // Convert image to canvas if needed
  let canvas: HTMLCanvasElement;
  if (sprite instanceof HTMLImageElement) {
    canvas = document.createElement('canvas');
    canvas.width = sprite.naturalWidth || sprite.width;
    canvas.height = sprite.naturalHeight || sprite.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(sprite, 0, 0);
  } else {
    canvas = sprite;
  }

  let processed = canvas;

  // Apply enhancements in order
  if (fullConfig.enableEdgeShading) {
    processed = applyEdgeShading(processed, fullConfig.edgeShadingIntensity);
  }

  if (fullConfig.enableDithering) {
    processed = applyDithering(processed, fullConfig.ditheringIntensity);
  }

  if (fullConfig.enableOutlineEnhancement) {
    processed = enhanceOutline(processed);
  }

  // Color palette optimization (always apply for pixel art)
  processed = optimizeColorPalette(processed, 256);

  return processed;
}

/**
 * Ensure pixel-perfect rendering context settings
 */
export function setupPixelPerfectContext(ctx: CanvasRenderingContext2D): void {
  (ctx as any).imageSmoothingEnabled = false;
  (ctx as any).webkitImageSmoothingEnabled = false;
  (ctx as any).mozImageSmoothingEnabled = false;
  (ctx as any).msImageSmoothingEnabled = false;
}

/**
 * Round to nearest pixel for subpixel animation support
 */
export function snapToPixel(value: number): number {
  return Math.round(value);
}

/**
 * Get subpixel offset for smooth animation (for non-pixel elements)
 */
export function getSubpixelOffset(frame: number, speed: number = 1): number {
  return (frame * speed) % 1;
}

