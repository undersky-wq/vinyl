import type { ImageColorsResult } from 'react-native-image-colors';

export type PlayerPalette = readonly [string, string, string];
export const DEFAULT_PLAYER_PALETTE: PlayerPalette = ['#2b2b2b', '#2b2b2b', '#2b2b2b'];

function parseColor(value?: string): [number, number, number] | null {
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) return null;
  return [1, 3, 5].map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255) as [number, number, number];
}

function toHsl([r, g, b]: [number, number, number]) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;
  if (delta === 0) return { hue: 0, saturation: 0, lightness };
  const hue = max === r ? ((g - b) / delta + (g < b ? 6 : 0))
    : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return { hue: hue * 60, saturation: delta / (1 - Math.abs(2 * lightness - 1)), lightness };
}

function fromHsl(hue: number, saturation: number, lightness: number): [number, number, number] {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
  const offset = lightness - chroma / 2;
  const channels = hue < 60 ? [chroma, x, 0] : hue < 120 ? [x, chroma, 0]
    : hue < 180 ? [0, chroma, x] : hue < 240 ? [0, x, chroma]
      : hue < 300 ? [x, 0, chroma] : [chroma, 0, x];
  return channels.map((value) => value + offset) as [number, number, number];
}

function luminance(rgb: [number, number, number]) {
  const [r, g, b] = rgb.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

function shade(hue: number, saturation: number, lightness: number, maxLuminance: number) {
  let rgb = fromHsl(hue, saturation, lightness);
  // Bright yellows/greens need more adjustment than blues to keep player text legible.
  while (luminance(rgb) > maxLuminance && lightness > 0.05) {
    lightness *= 0.95;
    rgb = fromHsl(hue, saturation, lightness);
  }
  return `#${rgb.map((value) => Math.round(value * 255).toString(16).padStart(2, '0')).join('')}`;
}

export function createPlayerPalette(colors: ImageColorsResult): PlayerPalette {
  const candidates = colors.platform === 'ios'
    ? [colors.background, colors.primary, colors.secondary, colors.detail]
    : [colors.dominant, colors.muted, colors.darkMuted, colors.vibrant, colors.darkVibrant, colors.lightVibrant];
  const swatches = candidates.map(parseColor).filter((value) => value !== null).map(toHsl);
  const dominant = swatches[0];
  // Paper, sepia and grayscale covers often contain a tiny warm tint. Treat it
  // as neutral instead of amplifying that noise into a strong red background.
  if (!dominant || dominant.saturation < 0.24) return DEFAULT_PLAYER_PALETTE;
  const saturation = Math.min(0.78, dominant.saturation);
  const solid = shade(dominant.hue, saturation, 0.32, 0.09);
  return [solid, solid, solid];
}

const CACHE_LIMIT = 64;
const paletteCache = new Map<string, PlayerPalette>();
const pending = new Map<string, Promise<PlayerPalette>>();

export function getCachedPlayerPalette(uri?: string) {
  return uri ? paletteCache.get(uri) : undefined;
}

export function loadPlayerPalette(uri: string): Promise<PlayerPalette> {
  const cached = paletteCache.get(uri);
  if (cached) return Promise.resolve(cached);
  const inFlight = pending.get(uri);
  if (inFlight) return inFlight;
  const request = (async () => {
    try {
      // Load only when the full player is opened. Old builds/Expo Go safely use the fallback.
      const { getColors } = await import('react-native-image-colors');
      const colors = await getColors(uri, { fallback: '#000000', cache: false, quality: 'low', pixelSpacing: 10 });
      const palette = createPlayerPalette(colors);
      paletteCache.set(uri, palette);
      if (paletteCache.size > CACHE_LIMIT) paletteCache.delete(paletteCache.keys().next().value!);
      return palette;
    } catch {
      // A missing/offline cover must never block playback. Retry on a later opening.
      return DEFAULT_PLAYER_PALETTE;
    } finally {
      pending.delete(uri);
    }
  })();
  pending.set(uri, request);
  return request;
}
