import * as FileSystem from 'expo-file-system/legacy';

export type ThemeMode = 'dark' | 'light';

let activeThemeMode: ThemeMode = 'light';

const darkColors = {
  background: '#111214',
  panel: '#111214',
  panelSoft: '#242424',
  text: '#f3f3f1',
  muted: '#96989d',
  accent: '#78a9ff',
  accentStrong: '#a5c6ff',
  border: '#ffffff35',
};

const lightColors = {
  background: '#ffffff',
  panel: '#ffffff',
  panelSoft: '#f2f2f2',
  text: '#111',
  muted: '#777777',
  accent: '#2563eb',
  accentStrong: '#1d4ed8',
  border: '#11111133',
};

export function setActiveThemeMode(mode: ThemeMode) {
  activeThemeMode = mode;
}

export function getActiveThemeMode() {
  return activeThemeMode;
}

const THEME_FILE = `${FileSystem.documentDirectory || ''}shelf-theme.txt`;

export async function loadThemeMode(): Promise<ThemeMode> {
  if (!FileSystem.documentDirectory) return 'light';
  try {
    const info = await FileSystem.getInfoAsync(THEME_FILE);
    if (!info.exists) return 'light';
    const saved = await FileSystem.readAsStringAsync(THEME_FILE);
    return saved.trim() === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export async function saveThemeMode(mode: ThemeMode) {
  if (!FileSystem.documentDirectory) return;
  try { await FileSystem.writeAsStringAsync(THEME_FILE, mode); } catch { /* Keep the in-memory setting. */ }
}

export const colors = new Proxy(darkColors, {
  get(_target, key: keyof typeof darkColors) {
    return (activeThemeMode === 'light' ? lightColors : darkColors)[key];
  },
}) as typeof darkColors;

const lightColorMap: Record<string, string> = {
  '#111111': lightColors.background,
  '#242424': lightColors.panelSoft,
  '#f5f5f5': lightColors.text,
  '#9b9b9b': lightColors.muted,
  '#dedee2': '#28282d',
  'rgba(24,24,24,0.96)': lightColors.panel,
  'rgba(16,16,18,0.98)': 'rgba(255,255,255,0.98)',
  'rgba(255,255,255,0.08)': lightColors.border,
  'rgba(255,255,255,0.035)': 'rgba(0,0,0,0.035)',
  'rgba(255,255,255,0.16)': 'rgba(0,0,0,0.12)',
  'rgba(255,255,255,0.24)': 'rgba(0,0,0,0.16)',
  'rgba(255,255,255,0.34)': 'rgba(0,0,0,0.20)',
  'rgba(255,255,255,0.88)': 'rgba(0,0,0,0.82)',
  'rgba(180,180,180,0.45)': 'rgba(80,80,90,0.35)',
};

const darkColorMap: Record<string, string> = {};

// Map both captured palettes, independent of the theme active at StyleSheet creation.
for (const key of Object.keys(darkColors) as Array<keyof typeof darkColors>) {
  lightColorMap[darkColors[key]] = lightColors[key];
  darkColorMap[lightColors[key]] = darkColors[key];
}

const legacyColors: Record<string, keyof typeof darkColors> = {
  '#111111': 'background', '#f5f5f7': 'background',
  'rgba(24,24,24,0.96)': 'panel', 'rgba(255,255,255,0.96)': 'panel',
  '#e9e9ee': 'panelSoft', '#f5f5f5': 'text', '#17171a': 'text',
  '#9b9b9b': 'muted', '#686873': 'muted',
  '#b578ff': 'accent', '#8143c7': 'accent',
  '#d2a4ff': 'accentStrong', '#7135b5': 'accentStrong',
  'rgba(255,255,255,0.08)': 'border', 'rgba(0,0,0,0.10)': 'border',
};
for (const [value, key] of Object.entries(legacyColors)) {
  lightColorMap[value] = lightColors[key];
  darkColorMap[value] = darkColors[key];
}
for (const [dark, light] of Object.entries(lightColorMap)) {
  // Prefer canonical colors over ambiguous historical aliases on the reverse path.
  if (!(light in darkColorMap)) darkColorMap[light] = dark;
}

function adaptValue(value: unknown): unknown {
  if (typeof value === 'string') {
    const map = activeThemeMode === 'light' ? lightColorMap : darkColorMap;
    return map[value] || value;
  }
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(adaptValue);
  // React Native freezes style objects in development; proxying their values can throw.
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, adaptValue(item)]));
}

export function adaptiveStyles<T extends Record<string, unknown>>(styles: T): T {
  return new Proxy({ ...styles }, {
    get(target, key: string) { return adaptValue(target[key]) as T[keyof T]; },
  });
}

// Secondary native screens share the same quiet chrome as the archive.
export function shelfStyles<T extends Record<string, unknown>>(styles: T): T {
  const flat = Object.fromEntries(Object.entries(styles).map(([name, value]) => {
    const style = { ...(value as Record<string, unknown>) };
    if ('borderRadius' in style && !/avatar/i.test(name)) style.borderRadius = 0;
    if ('shadowOpacity' in style) style.shadowOpacity = 0;
    if ('shadowRadius' in style) style.shadowRadius = 0;
    if (style.fontWeight === '900' || style.fontWeight === '800') style.fontWeight = '600';
    if (name === 'headerShell') Object.assign(style, { top: 12, paddingTop: 0, backgroundColor: colors.background });
    if (name === 'search' || name === 'input') Object.assign(style, { backgroundColor: 'transparent', borderBottomWidth: 1, borderBottomColor: colors.border });
    return [name, style];
  }));
  return adaptiveStyles(flat as T);
}

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 22,
  xl: 30,
};

export const radius = {
  sm: 12,
  md: 18,
  lg: 26,
  pill: 999,
};
