'use client';

import { Check, Heart, ListMusic, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { SiteLang } from '../lib/language';
import { useAuth } from '../providers/auth-provider';
import { useFavorites } from '../providers/favorites-provider';
import { usePlaylists } from '../providers/playlists-provider';
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
      data-tooltip={active ? 'Unlike' : 'Like'}
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
  sheetDrag?: boolean;
};

export function TrackPlaylistMenu({
  trackId,
  lang,
  className = '',
  align = 'down',
  sheetDrag = false,
}: TrackPlaylistMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [playlistName, setPlaylistName] = useState('');
  const [pendingActionKey, setPendingActionKey] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [autoAlign, setAutoAlign] = useState<'down' | 'up'>(align);
  const [popupDragY, setPopupDragY] = useState(0);
  const [isMobileSheet, setIsMobileSheet] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const popupDragStartYRef = useRef<number | null>(null);
  const popupDragYRef = useRef(0);
  const popupDidDragRef = useRef(false);
  const { requireAuth } = useAuth();
  const { createPlaylistWithTrack, isInAnyPlaylist, isLoading, playlists, toggleTrackInPlaylist } = usePlaylists();
  const isInPlaylist = isInAnyPlaylist(trackId);
  const canSheetDrag = sheetDrag || isMobileSheet;

  useEffect(() => {
    function syncMobileSheet() {
      setIsMobileSheet(window.matchMedia('(max-width: 760px)').matches);
    }

    syncMobileSheet();
    window.addEventListener('resize', syncMobileSheet);
    return () => window.removeEventListener('resize', syncMobileSheet);
  }, []);

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
      const createdPlaylist = await createPlaylistWithTrack({
        name: trimmedName,
        description: lang === 'ru' ? 'Создано из меню трека' : 'Created from track menu',
        trackId,
      });

      if (createdPlaylist) {
        setPlaylistName('');
        setIsOpen(false);
      }
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
      await toggleTrackInPlaylist(playlist, trackId);
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

  function startPopupDrag(clientY: number) {
    popupDragStartYRef.current = clientY;
    popupDragYRef.current = 0;
    popupDidDragRef.current = false;
    setPopupDragY(0);
  }

  function movePopupDrag(clientY: number) {
    if (popupDragStartYRef.current === null) {
      return;
    }

    const nextDragY = Math.max(0, clientY - popupDragStartYRef.current);
    popupDragYRef.current = nextDragY;
    popupDidDragRef.current = nextDragY > 6;
    setPopupDragY(nextDragY);
  }

  function finishPopupDrag() {
    if (popupDragStartYRef.current === null) {
      return;
    }

    const shouldClose = popupDragYRef.current > 44;
    popupDragStartYRef.current = null;
    popupDragYRef.current = 0;
    setPopupDragY(0);

    if (shouldClose) {
      setIsOpen(false);
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
        data-tooltip="Add to playlist"
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
        <div
          className={`track-playlist-menu__popup${canSheetDrag && popupDragY > 0 ? ' dragging' : ''}`}
          style={{ transform: canSheetDrag && popupDragY ? `translateY(${popupDragY}px)` : undefined }}
          onClickCapture={(event) => {
            if (canSheetDrag && popupDidDragRef.current) {
              event.preventDefault();
              event.stopPropagation();
              popupDidDragRef.current = false;
            }
          }}
          onPointerDown={(event) => {
            if (!canSheetDrag) {
              return;
            }

            const target = event.target as HTMLElement;
            if (target.closest('.track-playlist-menu__list, input, button')) {
              return;
            }
            startPopupDrag(event.clientY);
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (canSheetDrag) {
              movePopupDrag(event.clientY);
            }
          }}
          onPointerUp={(event) => {
            if (!canSheetDrag) {
              return;
            }
            event.currentTarget.releasePointerCapture(event.pointerId);
            finishPopupDrag();
          }}
          onPointerCancel={canSheetDrag ? finishPopupDrag : undefined}
        >
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
                {isLoading
                  ? lang === 'ru'
                    ? 'Загружаем...'
                    : 'Loading...'
                  : lang === 'ru'
                    ? 'Плейлистов пока нет.'
                    : 'No playlists yet.'}
              </p>
            )}
          </div>

          {status ? <p className="muted track-playlist-menu__status">{status}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
