'use client';

import { ChangeEvent, CSSProperties, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Upload } from 'lucide-react';
import {
  AudioBackfillStatus,
  AudioNormalizeStatus,
  getAudioNormalizeBackfillStatus,
  getAudioWaveformBackfillStatus,
  logoutUser,
  postDiscogsSync,
  startAudioNormalizeBackfill,
  startAudioWaveformBackfill,
  uploadAvatar,
} from '../lib/api';
import { SiteLang } from '../lib/language';
import { useAuth } from '../providers/auth-provider';
import { AuthUser, UserProfile } from '../types';

function getUserInitial(user: UserProfile) {
  return (user.displayName || user.email || '?').slice(0, 1).toUpperCase();
}

function formatUserDate(value: string, lang: SiteLang) {
  return new Intl.DateTimeFormat(lang === 'ru' ? 'ru-RU' : 'en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

export function ProfileScreen({
  lang,
  user,
  releasesCount,
  tracksCount,
  playlistsCount,
  users,
}: {
  lang: SiteLang;
  user: AuthUser;
  releasesCount: number;
  tracksCount: number;
  playlistsCount: number;
  users?: UserProfile[];
}) {
  const router = useRouter();
  const { setUser, user: authUser } = useAuth();
  const activeUser = authUser ?? user;
  const registeredUsers = users ?? [];
  const [status, setStatus] = useState('');
  const [isSyncingDiscogs, setIsSyncingDiscogs] = useState(false);
  const [discogsProgress, setDiscogsProgress] = useState(0);
  const [isBackfillingWaveform, setIsBackfillingWaveform] = useState(false);
  const [waveformProgress, setWaveformProgress] = useState(0);
  const [isNormalizingAudio, setIsNormalizingAudio] = useState(false);
  const [normalizeProgress, setNormalizeProgress] = useState(0);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(
    activeUser.avatarStorageUrl || null,
  );
  const discogsProgressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const waveformProgressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const normalizeProgressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      if (normalizeProgressTimerRef.current) {
        clearInterval(normalizeProgressTimerRef.current);
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

  function getNormalizeBackfillPercent(backfillStatus: AudioNormalizeStatus) {
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

  function clearNormalizeProgressTimer() {
    if (normalizeProgressTimerRef.current) {
      clearInterval(normalizeProgressTimerRef.current);
      normalizeProgressTimerRef.current = null;
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

  function finishNormalizeBackfill(backfillStatus: AudioNormalizeStatus) {
    clearNormalizeProgressTimer();
    setNormalizeProgress(getNormalizeBackfillPercent(backfillStatus));
    setIsNormalizingAudio(false);
    setStatus(
      lang === 'ru'
        ? `MP3 подготовлены: ${backfillStatus.normalized}, обработано: ${backfillStatus.processed}.`
        : `MP3 prepared: ${backfillStatus.normalized}, processed: ${backfillStatus.processed}.`,
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
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      setStatus(
        lang === 'ru'
          ? `Ошибка синхронизации${message ? `: ${message}` : '.'}`
          : `Sync failed${message ? `: ${message}` : '.'}`,
      );
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

  async function handleNormalizeBackfill() {
    clearNormalizeProgressTimer();
    setIsNormalizingAudio(true);
    setNormalizeProgress(0);

    try {
      const initialStatus = await startAudioNormalizeBackfill();
      setNormalizeProgress(getNormalizeBackfillPercent(initialStatus));

      if (initialStatus.status === 'completed') {
        finishNormalizeBackfill(initialStatus);
        return;
      }

      if (initialStatus.status === 'failed') {
        throw new Error(initialStatus.error || 'Audio normalization failed');
      }

      const pollStatus = async () => {
        const nextStatus = await getAudioNormalizeBackfillStatus();
        setNormalizeProgress(getNormalizeBackfillPercent(nextStatus));

        if (nextStatus.status === 'completed') {
          finishNormalizeBackfill(nextStatus);
        }

        if (nextStatus.status === 'failed') {
          clearNormalizeProgressTimer();
          setIsNormalizingAudio(false);
          setStatus(lang === 'ru' ? 'Ошибка подготовки MP3.' : 'MP3 preparation failed.');
        }
      };

      normalizeProgressTimerRef.current = setInterval(() => {
        void pollStatus();
      }, 1000);
      await pollStatus();
    } catch {
      clearNormalizeProgressTimer();
      setIsNormalizingAudio(false);
      setNormalizeProgress(0);
      setStatus(lang === 'ru' ? 'Ошибка подготовки MP3.' : 'MP3 preparation failed.');
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

              <button
                type="button"
                className={`profile-action-button${isNormalizingAudio ? ' is-loading' : ''}`}
                onClick={handleNormalizeBackfill}
                disabled={isNormalizingAudio}
                style={{ ['--profile-progress' as string]: `${normalizeProgress}%` } as CSSProperties}
              >
                <span className="profile-action-button__label">
                  {isNormalizingAudio
                    ? `MP3 ${normalizeProgress}%`
                    : lang === 'ru'
                      ? 'Подготовить MP3'
                      : 'Prepare MP3'}
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

      {activeUser.role === 'ADMIN' ? (
        <article className="release-panel profile-panel profile-users-panel">
          <div className="profile-users-header">
            <div>
              <p className="muted">{lang === 'ru' ? 'Пользователи' : 'Users'}</p>
              <h2>{lang === 'ru' ? 'Зарегистрированные аккаунты' : 'Registered accounts'}</h2>
            </div>
            <strong>{registeredUsers.length}</strong>
          </div>

          <div className="profile-users-list">
            {registeredUsers.map((item) => (
              <div className="profile-user-row" key={item.id}>
                <div className="profile-user-avatar">
                  {item.avatarStorageUrl ? (
                    <img src={item.avatarStorageUrl} alt={item.displayName} />
                  ) : (
                    <span>{getUserInitial(item)}</span>
                  )}
                </div>

                <div className="profile-user-main">
                  <div className="profile-user-name">
                    <strong>{item.displayName}</strong>
                    <span>{item.role}</span>
                  </div>
                  <p className="muted">{item.email || 'No email'}</p>
                  <p className="profile-user-date">
                    {lang === 'ru' ? 'Регистрация' : 'Joined'} {formatUserDate(item.createdAt, lang)}
                  </p>
                </div>

                <div className="profile-user-stats">
                  <span>
                    <b>{item._count.playlists}</b>
                    <em>{lang === 'ru' ? 'плейлисты' : 'playlists'}</em>
                  </span>
                  <span>
                    <b>{item._count.favoriteTracks}</b>
                    <em>{lang === 'ru' ? 'избранное' : 'favourites'}</em>
                  </span>
                  <span>
                    <b>{item._count.audioFiles}</b>
                    <em>MP3</em>
                  </span>
                  <span>
                    <b>{item._count.collectionItems}</b>
                    <em>{lang === 'ru' ? 'коллекция' : 'collection'}</em>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </article>
      ) : null}
    </section>
  );
}
