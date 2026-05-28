'use client';

import { Pause, Play } from 'lucide-react';
import { SiteLang } from '../lib/language';
import { CoverImage } from './cover-image';
import { FavoriteButton, TrackPlaylistMenu } from './track-actions';

const KEY_COLORS: Record<string, string> = {
  C: '#d67adf',
  Am: '#dfb2e5',
  G: '#8a7aa3',
  Em: '#b7afc5',
  D: '#6f93c7',
  Bm: '#b6c8df',
  A: '#55b8e9',
  'F#m': '#9ad9ea',
  Gbm: '#9ad9ea',
  E: '#49d2d5',
  'C#m': '#86dddd',
  Dbm: '#86dddd',
  B: '#50c989',
  'G#m': '#97d8c0',
  Abm: '#97d8c0',
  'F#': '#73e86e',
  'D#m': '#9def98',
  Ebm: '#9def98',
  'C#': '#aee650',
  'A#m': '#cceb9b',
  Bbm: '#cceb9b',
  'G#': '#ffe75a',
  Fm: '#fff0a1',
  'D#': '#ffb85b',
  Cm: '#ffd8a1',
  'A#': '#e9484e',
  Gm: '#ef9295',
  F: '#f544a1',
  Dm: '#f28bc4',
};

function getKeyColor(key?: string | null) {
  if (!key) {
    return null;
  }

  return KEY_COLORS[key.trim()] || null;
}

function formatTrackDuration(durationRaw?: string | null, durationSec?: number | null) {
  if (durationRaw) {
    return durationRaw;
  }

  if (!durationSec || !Number.isFinite(durationSec)) {
    return '-';
  }

  const minutes = Math.floor(durationSec / 60);
  const seconds = durationSec % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

type PlaylistTrackRowProps = {
  lang: SiteLang;
  trackId: string;
  title: string;
  artist: string;
  coverUrl: string;
  indexLabel: string | number;
  durationRaw?: string | null;
  durationSec?: number | null;
  bpm?: number | null;
  keyValue?: string | null;
  isCurrentTrack: boolean;
  isPlaying: boolean;
  isDragging?: boolean;
  className?: string;
  disabled?: boolean;
  draggable?: boolean;
  showFavorite?: boolean;
  showPlaylistMenu?: boolean;
  onPlay: () => void;
  onDragStart?: React.DragEventHandler<HTMLDivElement>;
  onDragOver?: React.DragEventHandler<HTMLDivElement>;
  onDrop?: React.DragEventHandler<HTMLDivElement>;
  onDragEnd?: React.DragEventHandler<HTMLDivElement>;
};

export function PlaylistTrackRow({
  lang,
  trackId,
  title,
  artist,
  coverUrl,
  indexLabel,
  durationRaw,
  durationSec,
  bpm,
  keyValue,
  isCurrentTrack,
  isPlaying,
  isDragging = false,
  className = '',
  disabled = false,
  draggable = false,
  showFavorite = true,
  showPlaylistMenu = true,
  onPlay,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: PlaylistTrackRowProps) {
  return (
    <div
      className={`playlist-track${className ? ` ${className}` : ''}${isCurrentTrack ? ' active' : ''}${
        isDragging ? ' dragging' : ''
      }`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <button
        type="button"
        className="playlist-track__cover"
        disabled={disabled}
        onClick={onPlay}
        aria-label={isCurrentTrack && isPlaying ? 'Pause' : 'Play'}
      >
        <CoverImage src={coverUrl} alt="" width={44} height={44} />
        <span className="playlist-track__play">
          {isCurrentTrack && isPlaying ? <Pause size={15} /> : <Play size={15} fill="currentColor" />}
        </span>
      </button>

      <div className="playlist-track__number">{indexLabel}</div>

      <button type="button" className="playlist-track__title" onClick={onPlay} disabled={disabled}>
        <span className="playlist-track__artist">{artist}</span>
        <span>{title}</span>
      </button>

      <div className="playlist-track__actions">
        {bpm ? <span className="playlist-track__bpm">{bpm} BPM</span> : null}
        {keyValue ? (
          <span className="playlist-track__key" style={{ color: getKeyColor(keyValue) || undefined }}>
            {keyValue}
          </span>
        ) : null}
        {showFavorite ? <FavoriteButton trackId={trackId} lang={lang} /> : null}
        {showPlaylistMenu ? <TrackPlaylistMenu trackId={trackId} lang={lang} /> : null}
      </div>

      <div className="playlist-track__time muted">{formatTrackDuration(durationRaw, durationSec)}</div>
    </div>
  );
}
