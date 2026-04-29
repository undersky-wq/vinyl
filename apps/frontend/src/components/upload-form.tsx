'use client';

import { LoaderCircle, Plus, Trash2, UploadCloud } from 'lucide-react';
import { useState } from 'react';
import { createManualRelease } from '../lib/api';
import { SiteLang } from '../lib/language';
import { Release } from '../types';

type UploadFormProps = {
  lang: SiteLang;
  releases?: Release[];
};

type ManualTrackRow = {
  id: string;
  position: string;
  artist: string;
  title: string;
  bpm: string;
  key: string;
  audioFile: File | null;
};

function createTrackRow(index: number): ManualTrackRow {
  return {
    id: crypto.randomUUID(),
    position: index === 0 ? 'A1' : '',
    artist: '',
    title: '',
    bpm: '',
    key: '',
    audioFile: null,
  };
}

export function UploadForm({ lang }: UploadFormProps) {
  const [artist, setArtist] = useState('');
  const [title, setTitle] = useState('');
  const [year, setYear] = useState('');
  const [country, setCountry] = useState('');
  const [styles, setStyles] = useState('');
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [tracks, setTracks] = useState<ManualTrackRow[]>(() => [createTrackRow(0)]);
  const [status, setStatus] = useState('');
  const [createdReleaseId, setCreatedReleaseId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateTrack(id: string, patch: Partial<ManualTrackRow>) {
    setTracks((current) => current.map((track) => (track.id === id ? { ...track, ...patch } : track)));
  }

  function removeTrack(id: string) {
    setTracks((current) => (current.length > 1 ? current.filter((track) => track.id !== id) : current));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('');
    setCreatedReleaseId('');

    const validTracks = tracks.filter((track) => track.title.trim());
    if (!artist.trim() || !title.trim() || !validTracks.length) {
      setStatus(
        lang === 'ru'
          ? 'Заполни артиста, название релиза и хотя бы один трек.'
          : 'Fill artist, release title, and at least one track.',
      );
      return;
    }

    const payload = new FormData();
    payload.append('artist', artist.trim());
    payload.append('title', title.trim());
    payload.append('year', year.trim());
    payload.append('country', country.trim());
    payload.append('styles', styles.trim());
    payload.append(
      'tracks',
      JSON.stringify(
        validTracks.map((track) => ({
          position: track.position.trim(),
          artist: track.artist.trim(),
          title: track.title.trim(),
          bpm: track.bpm.trim(),
          key: track.key.trim(),
        })),
      ),
    );

    if (coverFile) {
      payload.append('cover', coverFile);
    }

    validTracks.forEach((track, index) => {
      if (track.audioFile) {
        payload.append(`audio-${index}`, track.audioFile);
      }
    });

    setIsSubmitting(true);
    try {
      const release = await createManualRelease(payload);
      setCreatedReleaseId(release.id);
      setStatus(lang === 'ru' ? 'Релиз добавлен в коллекцию.' : 'Release added to collection.');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      setStatus(
        lang === 'ru'
          ? `Не удалось добавить релиз${message ? `: ${message}` : '.'}`
          : `Failed to add release${message ? `: ${message}` : '.'}`,
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="upload-form upload-form--manual release-panel" onSubmit={handleSubmit}>
      <div className="manual-upload__section">
        <div>
          <p className="muted">{lang === 'ru' ? 'Данные релиза' : 'Release details'}</p>
          <h2>{lang === 'ru' ? 'Новый релиз вручную' : 'New manual release'}</h2>
        </div>

        <div className="manual-upload__grid">
          <div className="field">
            <label htmlFor="manual-artist">{lang === 'ru' ? 'Артист релиза' : 'Release artist'}</label>
            <input id="manual-artist" value={artist} onChange={(event) => setArtist(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="manual-title">{lang === 'ru' ? 'Название релиза' : 'Release title'}</label>
            <input id="manual-title" value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="manual-year">{lang === 'ru' ? 'Год' : 'Year'}</label>
            <input id="manual-year" inputMode="numeric" value={year} onChange={(event) => setYear(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="manual-country">{lang === 'ru' ? 'Страна' : 'Country'}</label>
            <input id="manual-country" value={country} onChange={(event) => setCountry(event.target.value)} />
          </div>
          <div className="field manual-upload__wide">
            <label htmlFor="manual-styles">
              {lang === 'ru' ? 'Стили через запятую' : 'Styles, comma separated'}
            </label>
            <input
              id="manual-styles"
              value={styles}
              onChange={(event) => setStyles(event.target.value)}
              placeholder="House, Deep House, Breakbeat"
            />
          </div>
          <div className="field manual-upload__wide">
            <label htmlFor="manual-cover">{lang === 'ru' ? 'Обложка' : 'Cover artwork'}</label>
            <input
              id="manual-cover"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="file-input"
              onChange={(event) => setCoverFile(event.target.files?.[0] || null)}
            />
          </div>
        </div>
      </div>

      <div className="manual-upload__section">
        <div className="manual-upload__section-head">
          <div>
            <p className="muted">{lang === 'ru' ? 'Треклист' : 'Tracklist'}</p>
            <h2>{lang === 'ru' ? 'Треки и MP3' : 'Tracks and MP3 files'}</h2>
          </div>
          <button
            type="button"
            className="track-icon-button"
            onClick={() => setTracks((current) => [...current, createTrackRow(current.length)])}
            aria-label={lang === 'ru' ? 'Добавить трек' : 'Add track'}
          >
            <Plus size={17} />
          </button>
        </div>

        <div className="manual-track-list">
          {tracks.map((track, index) => (
            <div className="manual-track-row" key={track.id}>
              <div className="manual-track-row__number">{index + 1}</div>
              <input
                value={track.position}
                onChange={(event) => updateTrack(track.id, { position: event.target.value })}
                placeholder="A1"
                aria-label={lang === 'ru' ? 'Позиция' : 'Position'}
              />
              <input
                value={track.artist}
                onChange={(event) => updateTrack(track.id, { artist: event.target.value })}
                placeholder={lang === 'ru' ? 'Артист трека' : 'Track artist'}
                aria-label={lang === 'ru' ? 'Артист трека' : 'Track artist'}
              />
              <input
                value={track.title}
                onChange={(event) => updateTrack(track.id, { title: event.target.value })}
                placeholder={lang === 'ru' ? 'Название трека' : 'Track title'}
                aria-label={lang === 'ru' ? 'Название трека' : 'Track title'}
              />
              <input
                value={track.bpm}
                onChange={(event) => updateTrack(track.id, { bpm: event.target.value })}
                placeholder="BPM"
                aria-label="BPM"
              />
              <input
                value={track.key}
                onChange={(event) => updateTrack(track.id, { key: event.target.value })}
                placeholder={lang === 'ru' ? 'Ключ' : 'Key'}
                aria-label={lang === 'ru' ? 'Ключ' : 'Key'}
              />
              <label className="manual-track-row__file">
                <UploadCloud size={16} />
                <span>{track.audioFile ? track.audioFile.name : 'MP3'}</span>
                <input
                  type="file"
                  accept=".mp3,audio/mpeg"
                  onChange={(event) => updateTrack(track.id, { audioFile: event.target.files?.[0] || null })}
                />
              </label>
              <button
                type="button"
                className="track-icon-button track-icon-button--danger"
                onClick={() => removeTrack(track.id)}
                disabled={tracks.length <= 1}
                aria-label={lang === 'ru' ? 'Удалить строку' : 'Remove row'}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="manual-upload__footer">
        <button className="nav-link manual-upload__submit" type="submit" disabled={isSubmitting}>
          {isSubmitting ? <LoaderCircle size={17} className="track-upload-button__spinner" /> : null}
          {lang === 'ru' ? 'Добавить релиз' : 'Add release'}
        </button>
        {createdReleaseId ? (
          <a className="nav-link" href={`/releases/${createdReleaseId}`}>
            {lang === 'ru' ? 'Открыть релиз' : 'Open release'}
          </a>
        ) : null}
      </div>

      {status ? <p className="muted">{status}</p> : null}
    </form>
  );
}
