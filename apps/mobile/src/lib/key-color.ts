const CAMELOT_NUMBER_BY_KEY: Record<string, number> = {
  '1A': 1, 'G#M': 1, ABM: 1, '1B': 1, B: 1,
  '2A': 2, 'D#M': 2, EBM: 2, '2B': 2, 'F#': 2, GB: 2,
  '3A': 3, 'A#M': 3, BBM: 3, '3B': 3, 'C#': 3, DB: 3,
  '4A': 4, FM: 4, '4B': 4, 'G#': 4, AB: 4,
  '5A': 5, CM: 5, '5B': 5, 'D#': 5, EB: 5,
  '6A': 6, GM: 6, '6B': 6, 'A#': 6, BB: 6,
  '7A': 7, DM: 7, '7B': 7, F: 7,
  '8A': 8, AM: 8, '8B': 8, C: 8,
  '9A': 9, EM: 9, '9B': 9, G: 9,
  '10A': 10, BM: 10, '10B': 10, D: 10,
  '11A': 11, 'F#M': 11, GBM: 11, '11B': 11, A: 11,
  '12A': 12, 'C#M': 12, DBM: 12, '12B': 12, E: 12,
};

// High-contrast hues arranged clockwise around the Camelot/circle-of-fifths wheel.
const CAMELOT_COLORS = [
  '#ff4d6d',
  '#ff7043',
  '#ff9f1c',
  '#ffd166',
  '#a7d129',
  '#38d996',
  '#2dd4bf',
  '#38bdf8',
  '#4f8cff',
  '#7c6cff',
  '#b56cff',
  '#e056c2',
] as const;

export function getKeyColor(value?: string | null) {
  if (!value?.trim()) {
    return undefined;
  }

  const normalized = value
    .trim()
    .replace(/♯/g, '#')
    .replace(/♭/g, 'b')
    .replace(/\s+/g, '')
    .toUpperCase();
  let camelotNumber = CAMELOT_NUMBER_BY_KEY[normalized];

  if (!camelotNumber) {
    const openKeyMatch = /^(1[0-2]|[1-9])([MD])$/.exec(normalized);
    if (openKeyMatch) {
      camelotNumber = ((Number(openKeyMatch[1]) + 6) % 12) + 1;
    }
  }

  return camelotNumber ? CAMELOT_COLORS[camelotNumber - 1] : undefined;
}
