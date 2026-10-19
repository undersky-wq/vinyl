'use client';
import './track-action-colors.css';
import './playlist-popup-desktop.css';

import { Check, Heart, ListMusic, Plus } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { clampPlaylistPopup, placePlaylistPopup } from '../lib/playlist-popup-position';
import { createPortal } from 'react-dom';
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
      aria-pressed={active}
      data-tooltip={active ? (lang === 'ru' ? 'Убрать лайк' : 'Unlike') : lang === 'ru' ? 'Лайк' : 'Like'}
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
  portal?: boolean;
  keepOpenAfterAction?: boolean;
};

export function TrackPlaylistMenu({
  trackId,
  lang,
  className = '',
  align = 'down',
  sheetDrag = false,
  portal = false,
  keepOpenAfterAction = false,
}: TrackPlaylistMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [playlistName, setPlaylistName] = useState('');
  const [pendingActionKey, setPendingActionKey] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [autoAlign, setAutoAlign] = useState<'down' | 'up'>(align);
  const [popupDragY, setPopupDragY] = useState(0);
  const [isMobileSheet, setIsMobileSheet] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const popupDragStartYRef = useRef<number | null>(null);
  const popupDragYRef = useRef(0);
  const popupDidDragRef = useRef(false);
  const [desktopPosition, setDesktopPosition] = useState<{x:number;y:number} | null>(null);
  const desktopDrag = useRef<{x:number;y:number;left:number;top:number} | null>(null);
  const desktopMoved = useRef(false);
  const { requireAuth } = useAuth();
  const { createPlaylistWithTrack, isInAnyPlaylist, isLoading, playlists, toggleTrackInPlaylist } = usePlaylists();
  const isInPlaylist = isInAnyPlaylist(trackId);
  const desktopPopup = isMounted && !isMobileSheet;
  const canSheetDrag = !desktopPopup && (sheetDrag || isMobileSheet);

  useEffect(() => {
    setIsMounted(true);

    function syncMobileSheet() {
      setIsMobileSheet(window.matchMedia('(max-width: 760px)').matches);
    }

    syncMobileSheet();
    window.addEventListener('resize', syncMobileSheet);
    return () => window.removeEventListener('resize', syncMobileSheet);
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }

    function updatePopupDirection() {
      if (!menuRef.current || isMobileSheet) {
        return;
      }

      const popup = popupRef.current;
      if (popup && desktopPopup) {
        const rect = popup.getBoundingClientRect();
        const player = menuRef.current.closest('.player-page');
        const anchor = player?.querySelector('.player-page__cover-frame') || menuRef.current.closest('.paper-list-tracks,.paper-tracklist,.mix-card,.shelf-mix-detail__content') || menuRef.current;
        const position = desktopMoved.current
          ? clampPlaylistPopup(rect.left,rect.top,rect.width,rect.height,window.innerWidth,window.innerHeight)
          : placePlaylistPopup(anchor.getBoundingClientRect(),rect.width,rect.height,window.innerWidth,window.innerHeight);
        setDesktopPosition(position);
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
      const target = event.target as Node;
      const clickedTrigger = menuRef.current?.contains(target);
      const clickedPopup = popupRef.current?.contains(target);

      if (!clickedTrigger && !clickedPopup) {
        setIsOpen(false);
      }
    }

    updatePopupDirection();
    const closeOnEscape = (event: KeyboardEvent) => {if (event.key === 'Escape') setIsOpen(false);};
    document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', updatePopupDirection);
    window.addEventListener('scroll', updatePopupDirection, { passive: true, capture: true });
    const observer = new ResizeObserver(updatePopupDirection);
    if (popupRef.current) observer.observe(popupRef.current);
    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', updatePopupDirection);
      window.removeEventListener('scroll', updatePopupDirection, true);
      observer.disconnect();
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [align, isMobileSheet, isOpen, desktopPopup]);

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
        if (!keepOpenAfterAction) setIsOpen(false);
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
      if (!keepOpenAfterAction) setIsOpen(false);
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

  const popup = isOpen ? (
    <div
      className={`track-playlist-menu__popup${portal || desktopPopup ? ' paper-track-menu-popup' : ''}${desktopPopup ? ' desktop-playlist-popup' : ''}${canSheetDrag && popupDragY > 0 ? ' dragging' : ''}`}
      ref={popupRef}
      style={desktopPopup ? { '--playlist-popup-left':`${desktopPosition?.x ?? 12}px`, '--playlist-popup-top':`${desktopPosition?.y ?? 12}px`, visibility:desktopPosition ? 'visible' : 'hidden' } as CSSProperties : { transform: canSheetDrag && popupDragY ? `translateY(${popupDragY}px)` : undefined }}
      onClickCapture={(event) => {
        if (canSheetDrag && popupDidDragRef.current) {
          event.preventDefault();
          event.stopPropagation();
          popupDidDragRef.current = false;
        }
      }}
      onPointerDown={(event) => {
        if (desktopPopup) {
          if (event.button !== 0 || !(event.target as HTMLElement).closest('.track-playlist-menu__title')) return;
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          desktopDrag.current = {x:event.clientX,y:event.clientY,left:rect.left,top:rect.top};
          popupDidDragRef.current = false;
          event.currentTarget.setPointerCapture(event.pointerId);
          return;
        }
        if (!canSheetDrag) {
          return;
        }

        if ((event.target as HTMLElement).closest('button, input, textarea, a')) {
          return;
        }

        startPopupDrag(event.clientY);
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (desktopPopup && desktopDrag.current) {
          const start = desktopDrag.current;
          const rect = event.currentTarget.getBoundingClientRect();
          desktopMoved.current = true;
          popupDidDragRef.current = Math.abs(event.clientX-start.x)+Math.abs(event.clientY-start.y)>6;
          setDesktopPosition(clampPlaylistPopup(start.left+event.clientX-start.x,start.top+event.clientY-start.y,rect.width,rect.height,window.innerWidth,window.innerHeight));
          return;
        }
        if (canSheetDrag) {
          movePopupDrag(event.clientY);
        }
      }}
      onPointerUp={(event) => {
        if (desktopDrag.current) {
          desktopDrag.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          return;
        }
        if (!canSheetDrag || popupDragStartYRef.current === null) {
          return;
        }

        event.currentTarget.releasePointerCapture(event.pointerId);
        finishPopupDrag();
      }}
      onPointerCancel={() => {desktopDrag.current = null;if (canSheetDrag) finishPopupDrag();}}
    >
      <div className="track-playlist-menu__create">
        <div className="track-playlist-menu__title" tabIndex={desktopPopup ? 0 : undefined} title={desktopPopup ? (lang==='ru'?'Перетащить окно; стрелки — переместить':'Drag window; arrow keys to move') : undefined} onKeyDown={event => {
          if (!desktopPopup || !desktopPosition || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
          event.preventDefault();event.stopPropagation();
          const rect = popupRef.current?.getBoundingClientRect();
          if (!rect) return;
          const step = event.shiftKey ? 10 : 30;
          desktopMoved.current = true;
          setDesktopPosition(clampPlaylistPopup(desktopPosition.x+(event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0),desktopPosition.y+(event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0),rect.width,rect.height,window.innerWidth,window.innerHeight));
        }}>
          {lang === 'ru' ? 'Добавить в плейлист' : 'Add to playlist'}
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
                disabled={pendingActionKey === `add:${playlist.id}` || pendingActionKey === `remove:${playlist.id}`}
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
  ) : null;
  const renderedPopup = (portal || isMobileSheet || desktopPopup) && isMounted && popup ? createPortal(popup, document.body) : popup;

  return (
    <div
      className={`track-playlist-menu${isOpen ? ' open' : ''}${
        autoAlign === 'up' ? ' track-playlist-menu--up' : ''
      }${className ? ` ${className}` : ''}`}
      ref={menuRef}
    >
      <button
        type="button"
        className={`track-playlist-menu__trigger${isOpen ? ' active' : ''}${isInPlaylist ? ' saved' : ''}`}
        aria-label={lang === 'ru' ? 'Меню трека' : 'Track menu'}
        data-tooltip={lang === 'ru' ? 'Добавить в плейлист' : 'Add to playlist'}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!isOpen && !requireAuth()) {
            return;
          }
          setStatus('');
          if (!isOpen) {
            setAutoAlign(align);
            setDesktopPosition(null);
            desktopMoved.current = false;
            desktopDrag.current = null;
          }
          setIsOpen((current) => !current);
        }}
      >
        <ListMusic size={17} />
      </button>

      {renderedPopup}
    </div>
  );
}
