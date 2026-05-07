'use client';

import { Check, Heart, ListMusic, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { addTrackToPlaylist, createPlaylist, getPlaylists, removeTrackFromPlaylist } from '../lib/api';
import { SiteLang } from '../lib/language';
import { useAuth } from '../providers/auth-provider';
import { useFavorites } from '../providers/favorites-provider';
import { Playlist } from '../types';

type FavoriteButtonProps = {
  trackId: string;
  lang: SiteLang;
  className?: string;
  alwaysVisible?: boolean;
};

export function FavoriteButton({
  trackId,
  lang,
  className = '',
  alwaysVisible = false,
}: FavoriteButtonProps) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const active = isFavorite(trackId);

  return (
    <button
      type="button"
      className={`track-favorite-button${active ? ' active' : ''}${alwaysVisible ? ' always-visible' : ''}${
        className ? ` ${className}` : ''
      }`}
      aria-label={lang === 'ru' ? 'Избранное' : 'Favorite'}
      onClick={() => void toggleFavorite(trackId)}
    >
      <Heart size={17} fill="currentColor" />
    </button>
  );
}

type TrackPlaylistMenuProps = {
  trackId: string;
  lang: SiteLang;
  className?: string;
  align?: 'down' | 'up';
};

function sortPlaylists(playlists: Playlist[]) {
  return [...playlists].sort((a, b) => a.name.localeCompare(b.name));
}

export function TrackPlaylistMenu({
  trackId,
  lang,
  className = '',
  align = 'down',
}: TrackPlaylistMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [playlistName, setPlaylistName] = useState('');
  const [pendingActionKey, setPendingActionKey] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [autoAlign, setAutoAlign] = useState<'down' | 'up'>(align);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const { requireAuth, user } = useAuth();
  const isInPlaylist = playlists.some((playlist) =>
    playlist.items.some((item) => item.track.id === trackId),
  );

  useEffect(() => {
    if (!user) {
      setPlaylists([]);
      return;
    }

    let ignore = false;
    getPlaylists()
      .then((items) => {
        if (!ignore) {
          setPlaylists(sortPlaylists(items));
        }
      })
      .catch(() => {
        if (!ignore) {
          setStatus(lang === 'ru' ? 'Не удалось загрузить плейлисты.' : 'Failed to load playlists.');
        }
      });

    return () => {
      ignore = true;
    };
  }, [lang, user?.id]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function updatePopupDirection() {
      if (!menuRef.current) {
        return;
      }

      const triggerRect = menuRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const preferredPopupHeight = 340;
      const bottomSpace = viewportHeight - triggerRect.bottom;
      const topSpace = triggerRect.top;

      setAutoAlign(bottomSpace < preferredPopupHeight && topSpace > bottomSpace ? 'up' : align);
    }

    function handlePointerDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    updatePopupDirection();
    window.addEventListener('resize', updatePopupDirection);
    window.addEventListener('scroll', updatePopupDirection, { passive: true });
    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      window.removeEventListener('resize', updatePopupDirection);
      window.removeEventListener('scroll', updatePopupDirection);
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [align, isOpen]);

  async function handleCreatePlaylist() {
    if (!requireAuth()) {
      return;
    }

    const trimmedName = playlistName.trim();
    if (!trimmedName) {
      setStatus(lang === 'ru' ? 'Введи название плейлиста.' : 'Enter a playlist name.');
      return;
    }

    setPendingActionKey('create');
    setStatus('');

    try {
      const createdPlaylist = await createPlaylist({
        name: trimmedName,
        description: lang === 'ru' ? 'Создано из меню трека' : 'Created from track menu',
        trackIds: [trackId],
      });
      setPlaylists((current) => sortPlaylists([createdPlaylist, ...current]));
      setPlaylistName('');
      setIsOpen(false);
    } catch {
      setStatus(lang === 'ru' ? 'Не удалось создать плейлист.' : 'Failed to create playlist.');
    } finally {
      setPendingActionKey(null);
    }
  }

  async function handleAddToPlaylist(playlist: Playlist) {
    if (!requireAuth()) {
      return;
    }

    const alreadyAdded = playlist.items.some((item) => item.track.id === trackId);
    const actionKey = `${alreadyAdded ? 'remove' : 'add'}:${playlist.id}`;
    setPendingActionKey(actionKey);
    setStatus('');

    try {
      const updatedPlaylist = alreadyAdded
        ? await removeTrackFromPlaylist(playlist.id, trackId)
        : await addTrackToPlaylist(playlist.id, trackId);
      setPlaylists((current) =>
        sortPlaylists(current.map((item) => (item.id === updatedPlaylist.id ? updatedPlaylist : item))),
      );
      setIsOpen(false);
    } catch {
      setStatus(
        alreadyAdded
          ? lang === 'ru'
            ? 'Не удалось убрать трек.'
            : 'Failed to remove track.'
          : lang === 'ru'
            ? 'Не удалось добавить трек.'
            : 'Failed to add track.',
      );
    } finally {
      setPendingActionKey(null);
    }
  }

  return (
    <div
      className={`track-playlist-menu${isOpen ? ' open' : ''}${
        autoAlign === 'up' ? ' track-playlist-menu--up' : ''
      }${
        className ? ` ${className}` : ''
      }`}
      ref={menuRef}
    >
      <button
        type="button"
        className={`track-playlist-menu__trigger${isOpen ? ' active' : ''}${
          isInPlaylist ? ' saved' : ''
        }`}
        aria-label={lang === 'ru' ? 'Меню трека' : 'Track menu'}
        onClick={() => {
          if (!isOpen && !requireAuth()) {
            return;
          }
          setStatus('');
          if (!isOpen) {
            setAutoAlign(align);
          }
          setIsOpen((current) => !current);
        }}
      >
        <ListMusic size={17} />
      </button>

      {isOpen ? (
        <div className="track-playlist-menu__popup">
          <div className="track-playlist-menu__create">
            <div className="track-playlist-menu__title">
              {lang === 'ru' ? 'Добавить плейлист' : 'Add playlist'}
            </div>
            <div className="track-playlist-menu__create-row">
              <input
                value={playlistName}
                onChange={(event) => setPlaylistName(event.target.value)}
                placeholder={lang === 'ru' ? 'Название плейлиста' : 'Playlist name'}
              />
              <button
                type="button"
                disabled={pendingActionKey === 'create'}
                onClick={() => void handleCreatePlaylist()}
                aria-label={lang === 'ru' ? 'Создать плейлист' : 'Create playlist'}
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          <div className="track-playlist-menu__list">
            {playlists.length ? (
              playlists.map((playlist) => {
                const alreadyAdded = playlist.items.some((item) => item.track.id === trackId);

                return (
                  <button
                    type="button"
                    key={playlist.id}
                    className={`track-playlist-menu__item${alreadyAdded ? ' selected' : ''}`}
                    disabled={
                      pendingActionKey === `add:${playlist.id}` ||
                      pendingActionKey === `remove:${playlist.id}`
                    }
                    onClick={() => void handleAddToPlaylist(playlist)}
                  >
                    <span>{playlist.name}</span>
                    {alreadyAdded ? <Check size={14} /> : null}
                  </button>
                );
              })
            ) : (
              <p className="muted">
                {lang === 'ru' ? 'Плейлистов пока нет.' : 'No playlists yet.'}
              </p>
            )}
          </div>

          {status ? <p className="muted track-playlist-menu__status">{status}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
