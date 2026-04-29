'use client';

import { useState } from 'react';
import { createPlaylist } from '../lib/api';
import { SiteLang } from '../lib/language';
import { Release } from '../types';

type PlaylistCreatorProps = {
  lang: SiteLang;
  releases: Release[];
};

export function PlaylistCreator({ releases, lang }: PlaylistCreatorProps) {
  const [status, setStatus] = useState('');
  const tracks = releases.flatMap((release) =>
    release.tracks.map((track) => ({
      id: track.id,
      label: `${release.artist} — ${track.title}`,
    })),
  );

  return (
    <form
      className="playlist-panel release-panel"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const trackIds = form.getAll('trackIds').map(String);
        const name = String(form.get('name') || '');

        if (!name) {
          setStatus(lang === 'ru' ? 'Нужно указать название плейлиста.' : 'Playlist name is required.');
          return;
        }

        await createPlaylist({
          name,
          description: String(form.get('description') || ''),
          trackIds,
        });

        setStatus(lang === 'ru' ? 'Плейлист сохранён.' : 'Playlist saved.');
        event.currentTarget.reset();
      }}
    >
      <div className="field">
        <label htmlFor="name">{lang === 'ru' ? 'Название' : 'Name'}</label>
        <input id="name" name="name" placeholder={lang === 'ru' ? 'Ночной сет' : 'Night Set'} />
      </div>
      <div className="field">
        <label htmlFor="description">{lang === 'ru' ? 'Описание' : 'Description'}</label>
        <textarea
          id="description"
          name="description"
          rows={3}
          placeholder={
            lang === 'ru'
              ? 'Медленный deep house для вечера'
              : 'Slow deep house for late evening'
          }
        />
      </div>
      <div className="field">
        <label htmlFor="trackIds">{lang === 'ru' ? 'Треки' : 'Tracks'}</label>
        <select id="trackIds" name="trackIds" multiple size={8}>
          {tracks.map((track) => (
            <option key={track.id} value={track.id}>
              {track.label}
            </option>
          ))}
        </select>
      </div>
      <button className="primary-button" type="submit">
        {lang === 'ru' ? 'Создать плейлист' : 'Create playlist'}
      </button>
      {status ? <p className="muted">{status}</p> : null}
    </form>
  );
}
