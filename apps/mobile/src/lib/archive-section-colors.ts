import type { TabKey } from '../types';

// Match the section identities in the website's record-archive.css.
export const ARCHIVE_SECTION_COLORS = {
  home: '#3478db',
  playlists: '#27874d',
  mixes: '#8950c8',
  originals: '#d9a441',
  favorites: '#db3045',
};

export function archiveSectionColor(section: TabKey, fallback: string) {
  return ARCHIVE_SECTION_COLORS[section as keyof typeof ARCHIVE_SECTION_COLORS] ?? fallback;
}

export function archiveWaveformColor(section: TabKey, fallback: string, dark: boolean) {
  return section === 'originals' ? (dark ? '#e5ab4c' : '#b77713') : archiveSectionColor(section, fallback);
}
