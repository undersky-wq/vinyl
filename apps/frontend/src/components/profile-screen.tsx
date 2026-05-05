'use client';

import { ChangeEvent, CSSProperties, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Upload } from 'lucide-react';
import {
  AudioBackfillStatus,
  getAudioWaveformBackfillStatus,
  logoutUser,
  postDiscogsSync,
  startAudioWaveformBackfill,
  uploadAvatar,
} from '../lib/api';
import { SiteLang } from '../lib/language';
import { useAuth } from '../providers/auth-provider';
import { AuthUser } from '../types';

export function ProfileScreen({
  lang,
  user,
  releasesCount,
  tracksCount,
  playlistsCount,
}: {
  lang: SiteLang;
  user: AuthUser;
  releasesCount: number;
  tracksCount: number;
  playlistsCount: number;
}) {
  const router = useRouter();
  const { setUser, user: authUser } = useAuth();
  const activeUser = authUser ?? user;
  const [status, setStatus] = useState('');
  const [isSyncingDiscogs, setIsSyncingDiscogs] = useState(false);
  const [discogsProgress, setDiscogsProgress] = useState(0);
  const [isBackfillingWaveform, setIsBackfillingWaveform] = useState(false);
  const [waveformProgress, setWaveformProgress] = useState(0);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(
    activeUser.avatarStorageUrl || null,
  );
  const discogsProgressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const waveformProgressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (avatarPreviewUrl?.startsWith('blob:')) {
      return;
    }

    setAvatarPreviewUrl(activeUser.avatarStorageUrl || null);
  }, [activeUser.avatarStorageUrl, avatarPreviewUrl]);

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(avatarPreviewUrl);
      }
      if (discogsProgressTimerRef.current) {
        clearInterval(discogsProgressTimerRef.current);
      }
      if (waveformProgressTimerRef.current) {
        clearInterval(waveformProgressTimerRef.current);
      }
    };
  }, [avatarPreviewUrl]);

  function getWaveformBackfillPercent(backfillStatus: AudioBackfillStatus) {
    if (backfillStatus.total <= 0) {
      return backfillStatus.status === 'running' ? 1 : 0;
    }

    return Math.min(
      100,
      Math.round((backfillStatus.processed / backfillStatus.total) * 100),
    );
  }

  function clearWaveformProgressTimer() {
    if (waveformProgressTimerRef.current) {
      clearInterval(waveformProgressTimerRef.current);
      waveformProgressTimerRef.current = null;
    }
  }

  function finishWaveformBackfill(backfillStatus: AudioBackfillStatus) {
    clearWaveformProgressTimer();
    setWaveformProgress(getWaveformBackfillPercent(backfillStatus));
    setIsBackfillingWaveform(false);
    setStatus(
      lang === 'ru'
        ? `Waveform обновлена: ${backfillStatus.waveformUpdated}, обработано: ${backfillStatus.processed}.`
        : `Waveform updated: ${backfillStatus.waveformUpdated}, processed: ${backfillStatus.processed}.`,
    );
    router.refresh();
  }

  async function handleAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(file);
    setAvatarPreviewUrl((current) => {
      if (current?.startsWith('blob:')) {
        URL.revokeObjectURL(current);
      }
      return nextPreviewUrl;
    });

    try {
      const updatedUser = await uploadAvatar(file);
      const avatarStorageUrl = updatedUser.avatarStorageUrl || null;

      setUser({
        ...updatedUser,
        avatarStorageUrl,
      });
      setAvatarPreviewUrl(avatarStorageUrl);
      URL.revokeObjectURL(nextPreviewUrl);
      setStatus(lang === 'ru' ? 'Аватар обновлён.' : 'Avatar updated.');
    } catch {
      setAvatarPreviewUrl(activeUser.avatarStorageUrl || null);
      setStatus(lang === 'ru' ? 'Не удалось загрузить аватар.' : 'Failed to upload avatar.');
    } finally {
      event.target.value = '';
    }
  }

  async function handleDiscogsSync() {
    setIsSyncingDiscogs(true);
    setDiscogsProgress(8);
    if (discogsProgressTimerRef.current) {
      clearInterval(discogsProgressTimerRef.current);
    }

    discogsProgressTimerRef.current = setInterval(() => {
      setDiscogsProgress((current) => {
        if (current >= 92) {
          return current;
        }

        const step = current < 40 ? 9 : current < 70 ? 5 : 2;
        return Math.min(92, current + step);
      });
    }, 500);

    try {
      await postDiscogsSync();
      setDiscogsProgress(100);
      setStatus(lang === 'ru' ? 'Синхронизация завершена.' : 'Sync completed.');
      router.refresh();
    } catch {
      setStatus(lang === 'ru' ? 'Ошибка синхронизации.' : 'Sync failed.');
    } finally {
      if (discogsProgressTimerRef.current) {
        clearInterval(discogsProgressTimerRef.current);
      }

      setTimeout(() => {
        setIsSyncingDiscogs(false);
        setDiscogsProgress(0);
      }, 500);
    }
  }

  async function handleWaveformBackfill() {
    clearWaveformProgressTimer();
    setIsBackfillingWaveform(true);
    setWaveformProgress(0);

    try {
      const initialStatus = await startAudioWaveformBackfill();
      setWaveformProgress(getWaveformBackfillPercent(initialStatus));

      if (initialStatus.status === 'completed') {
        finishWaveformBackfill(initialStatus);
        return;
      }

      if (initialStatus.status === 'failed') {
        throw new Error(initialStatus.error || 'Waveform backfill failed');
      }

      const pollStatus = async () => {
        const nextStatus = await getAudioWaveformBackfillStatus();
        setWaveformProgress(getWaveformBackfillPercent(nextStatus));

        if (nextStatus.status === 'completed') {
          finishWaveformBackfill(nextStatus);
        }

        if (nextStatus.status === 'failed') {
          clearWaveformProgressTimer();
          setIsBackfillingWaveform(false);
          setStatus(lang === 'ru' ? 'Ошибка пересчёта waveform.' : 'Waveform backfill failed.');
        }
      };

      waveformProgressTimerRef.current = setInterval(() => {
        void pollStatus();
      }, 1000);
      await pollStatus();
    } catch {
      clearWaveformProgressTimer();
      setIsBackfillingWaveform(false);
      setWaveformProgress(0);
      setStatus(lang === 'ru' ? 'Ошибка пересчёта waveform.' : 'Waveform backfill failed.');
    }
  }

  async function handleLogout() {
    await logoutUser();
    setUser(null);
    router.push('/profile?mode=login');
    router.refresh();
  }

  return (
    <section className="profile-grid">
      <article className="release-panel profile-panel">
        <div className="profile-hero">
          <label className="profile-avatar">
            {avatarPreviewUrl ? (
              <img src={avatarPreviewUrl} alt={activeUser.displayName} />
            ) : (
              <span>{activeUser.displayName.slice(0, 1).toUpperCase()}</span>
            )}
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleAvatar} />
          </label>

          <div>
            <p className="muted">{activeUser.role === 'ADMIN' ? 'Administrator' : 'Member'}</p>
            <h1 className="profile-title">{activeUser.displayName}</h1>
            <p className="muted">{activeUser.email}</p>
          </div>
        </div>

        {activeUser.role === 'ADMIN' ? (
          <div className="profile-stats">
            <div className="stat-card">
              <span className="muted">{lang === 'ru' ? 'Релизы' : 'Releases'}</span>
              <strong>{releasesCount}</strong>
            </div>
            <div className="stat-card">
              <span className="muted">{lang === 'ru' ? 'Плейлисты' : 'Playlists'}</span>
              <strong>{playlistsCount}</strong>
            </div>
            <div className="stat-card">
              <span className="muted">{lang === 'ru' ? 'Треки' : 'Tracks'}</span>
              <strong>{tracksCount}</strong>
            </div>
          </div>
        ) : null}

        <div className="profile-actions">
          {activeUser.role === 'ADMIN' ? (
            <>
              <Link href="/upload" className="profile-action-button">
                <Upload size={16} />
                <span className="profile-action-button__label">
                  {lang === 'ru' ? 'Загрузить' : 'Upload'}
                </span>
              </Link>

              <button
                type="button"
                className={`profile-action-button${isSyncingDiscogs ? ' is-loading' : ''}`}
                onClick={handleDiscogsSync}
                disabled={isSyncingDiscogs}
                style={{ ['--profile-progress' as string]: `${discogsProgress}%` } as CSSProperties}
              >
                <span className="profile-action-button__label">
                  {isSyncingDiscogs
                    ? lang === 'ru'
                      ? `Синхронизация ${discogsProgress}%`
                      : `Syncing ${discogsProgress}%`
                    : lang === 'ru'
                      ? 'Синхронизировать Discogs'
                      : 'Sync Discogs'}
                </span>
              </button>

              <button
                type="button"
                className={`profile-action-button${isBackfillingWaveform ? ' is-loading' : ''}`}
                onClick={handleWaveformBackfill}
                disabled={isBackfillingWaveform}
                style={{ ['--profile-progress' as string]: `${waveformProgress}%` } as CSSProperties}
              >
                <span className="profile-action-button__label">
                  {isBackfillingWaveform
                    ? `Waveform ${waveformProgress}%`
                    : lang === 'ru'
                      ? 'Пересчитать waveform'
                      : 'Backfill waveform'}
                </span>
              </button>
            </>
          ) : null}

          <button type="button" className="profile-action-button" onClick={handleLogout}>
            {lang === 'ru' ? 'Выйти' : 'Logout'}
          </button>
        </div>

        {status ? <p className="muted">{status}</p> : null}
      </article>
    </section>
  );
}
