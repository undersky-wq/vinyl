'use client';

import { ChangeEvent, CSSProperties, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter,useSearchParams } from 'next/navigation';
import { Upload,UserRound,ShieldCheck,Palette,Wrench,LibraryBig,Users,RefreshCw,AudioLines,FileAudio } from 'lucide-react';
import { ShelfDesignSettings } from './shelf-design-settings';
import { ProfileToggle } from './profile-toggle';
import './profile-admin-sections.css';
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
  updateAuthSettings,
} from '../lib/api';
import { SiteLang } from '../lib/language';
import { useAuth } from '../providers/auth-provider';
import { AuthSettings, AuthUser, UserProfile } from '../types';
import {
  ADMIN_EDIT_MODE_EVENT,
  ADMIN_EDIT_MODE_STORAGE_KEY,
  setAdminEditModeClass,
  useWebEditMode,
  setWebEditMode,
} from './admin-edit-mode-sync';
import { DancerSetting } from './dancer-setting';
import { TwoFactorSettings } from './two-factor-settings';
import { CoverMaintenance } from './cover-maintenance';
import { ProfilePasswordForm } from './profile-password-form';
import { RegisteredUsersList } from './registered-users-list';
import { getUsers } from '../lib/api';

function getUserInitial(user: UserProfile) {
  return (user.displayName || user.email || '?').slice(0, 1).toUpperCase();
}

export function ProfileScreen({
  lang,
  user,
  authSettings,
}: {
  lang: SiteLang;
  user: AuthUser;
  authSettings?: AuthSettings;
}) {
  const router = useRouter();
  const requestedSection=useSearchParams().get('section');
  const adminSections=[{key:'profile',ru:'Профиль',en:'Profile',Icon:UserRound},{key:'security',ru:'Безопасность',en:'Security',Icon:ShieldCheck},{key:'design',ru:'Дизайн сайта',en:'Site design',Icon:Palette},{key:'maintenance',ru:'Обслуживание',en:'Maintenance',Icon:Wrench},{key:'content',ru:'Контент',en:'Content',Icon:LibraryBig},{key:'users',ru:'Пользователи',en:'Users',Icon:Users}] as const;
  type AdminSection=typeof adminSections[number]['key'];
  const [adminSection,setAdminSection]=useState<AdminSection>(adminSections.some(item=>item.key===requestedSection)?requestedSection as AdminSection:'profile');

  const webEditMode = useWebEditMode();
  const { setUser, user: authUser } = useAuth();
  const activeUser = authUser ?? user;
  const [registeredUsers,setRegisteredUsers] = useState<UserProfile[]>([]);
  const [usersLoading,setUsersLoading] = useState(false), [usersError,setUsersError] = useState(false), [usersRetry,setUsersRetry] = useState(0);
  useEffect(() => {
    if (activeUser.role !== 'ADMIN' || adminSection !== 'users') return;
    let cancelled = false;
    setUsersLoading(true);setUsersError(false);
    void getUsers().then(users => { if (!cancelled) setRegisteredUsers(users); })
      .catch(() => { if (!cancelled) setUsersError(true); })
      .finally(() => { if (!cancelled) setUsersLoading(false); });
    return () => { cancelled = true; };
  }, [activeUser.id,activeUser.role,adminSection,usersRetry]);
  const [status, setStatus] = useState('');
  const [isSyncingDiscogs, setIsSyncingDiscogs] = useState(false);
  const [discogsProgress, setDiscogsProgress] = useState(0);
  const [isBackfillingWaveform, setIsBackfillingWaveform] = useState(false);
  const [waveformProgress, setWaveformProgress] = useState(0);
  const [isNormalizingAudio, setIsNormalizingAudio] = useState(false);
  const [normalizeProgress, setNormalizeProgress] = useState(0);
  const [isRegistrationInviteRequired, setIsRegistrationInviteRequired] = useState(
    authSettings?.registrationInviteRequired ?? false,
  );
  const [isSavingAuthSettings, setIsSavingAuthSettings] = useState(false);
  const [playbackRequiresRegistration, setPlaybackRequiresRegistration] = useState(authSettings?.playbackRequiresRegistration ?? true);
  const [isSavingPlayback, setIsSavingPlayback] = useState(false);
  const [allowGuestMixPlayback, setAllowGuestMixPlayback] = useState(authSettings?.allowGuestMixPlayback ?? false);
  const [isSavingGuestMixPlayback, setIsSavingGuestMixPlayback] = useState(false);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(
    activeUser.avatarStorageUrl || null,
  );
  const [isAdminEditModeEnabled, setIsAdminEditModeEnabled] = useState(true);
  const discogsProgressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const waveformProgressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const normalizeProgressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const storedValue = window.localStorage.getItem(ADMIN_EDIT_MODE_STORAGE_KEY);
    const enabled = storedValue !== 'off';
    setIsAdminEditModeEnabled(enabled);
    setAdminEditModeClass(enabled);
  }, []);

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

  async function handlePlaybackToggle() {
    setIsSavingPlayback(true);
    try {
      const settings = await updateAuthSettings({ playbackRequiresRegistration: !playbackRequiresRegistration });
      setPlaybackRequiresRegistration(settings.playbackRequiresRegistration ?? true);
      setStatus(lang === 'ru'
        ? settings.playbackRequiresRegistration ? 'Отдельные треки доступны только после входа.' : 'Отдельные треки доступны всем.'
        : settings.playbackRequiresRegistration ? 'Individual tracks require sign-in.' : 'Individual tracks are available to everyone.');
      router.refresh();
    } catch {
      setStatus(lang === 'ru' ? 'Не удалось сохранить настройку прослушивания.' : 'Failed to save playback setting.');
    } finally { setIsSavingPlayback(false); }
  }

  async function handleGuestMixPlaybackToggle() {
    setIsSavingGuestMixPlayback(true);
    try {
      const settings = await updateAuthSettings({ allowGuestMixPlayback: !allowGuestMixPlayback });
      setAllowGuestMixPlayback(settings.allowGuestMixPlayback ?? false);
      setStatus(lang === 'ru'
        ? settings.allowGuestMixPlayback ? 'Миксы доступны без регистрации.' : 'Миксы доступны только после входа.'
        : settings.allowGuestMixPlayback ? 'Mixes are available without registration.' : 'Mixes require sign-in.');
      router.refresh();
    } catch {
      setStatus(lang === 'ru' ? 'Не удалось сохранить доступ к миксам.' : 'Failed to save mix playback setting.');
    } finally { setIsSavingGuestMixPlayback(false); }
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

  async function handleRegistrationInviteToggle() {
    const nextValue = !isRegistrationInviteRequired;
    setIsRegistrationInviteRequired(nextValue);
    setIsSavingAuthSettings(true);
    setStatus('');

    try {
      const nextSettings = await updateAuthSettings({
        registrationInviteRequired: nextValue,
      });
      setIsRegistrationInviteRequired(nextSettings.registrationInviteRequired);
      setStatus(
        lang === 'ru'
          ? nextSettings.registrationInviteRequired
            ? 'Пароль регистрации включён.'
            : 'Пароль регистрации выключен.'
          : nextSettings.registrationInviteRequired
            ? 'Registration invite is enabled.'
            : 'Registration invite is disabled.',
      );
    } catch {
      setIsRegistrationInviteRequired(!nextValue);
      setStatus(lang === 'ru' ? 'Не удалось сохранить настройку регистрации.' : 'Failed to save registration setting.');
    } finally {
      setIsSavingAuthSettings(false);
    }
  }

  function handleAdminEditModeToggle() {
    const nextValue = !isAdminEditModeEnabled;
    setIsAdminEditModeEnabled(nextValue);
    window.localStorage.setItem(ADMIN_EDIT_MODE_STORAGE_KEY, nextValue ? 'on' : 'off');
    setAdminEditModeClass(nextValue);
    window.dispatchEvent(new Event(ADMIN_EDIT_MODE_EVENT));
  }

  const profileHero = (
    <div className={`profile-hero${activeUser.role==='ADMIN'?' profile-admin-identity':''}`}>
          <label className="profile-avatar">
            {avatarPreviewUrl ? (
              <img src={avatarPreviewUrl} alt={activeUser.displayName} />
            ) : (
              <span>{activeUser.displayName.slice(0, 1).toUpperCase()}</span>
            )}
            <input aria-label={lang === 'ru' ? 'Загрузить фото профиля' : 'Upload profile photo'} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleAvatar} />
          </label>
          <span className="paper-profile-avatar-hint">{lang === 'ru' ? 'Нажмите на фото, чтобы изменить' : 'Click photo to change'}</span>

          <div>
            <p className="muted">{activeUser.role === 'ADMIN' ? 'Administrator' : 'Member'}</p>
            <h1 className="profile-title">{activeUser.displayName}</h1>
            <p className="muted">{activeUser.email}</p>
          </div>
        </div>
  );

  return (
    <section className="profile-grid">
      <article className={`release-panel profile-panel${activeUser.role==='ADMIN'?' profile-panel--admin':''}`}>
        {activeUser.role==='ADMIN'&&<>
          {profileHero}
          <nav className="profile-admin-nav" aria-label={lang==='ru'?'Разделы администрирования':'Administration sections'}>{adminSections.map(({key,ru,en,Icon})=><button key={key} type="button" aria-pressed={adminSection===key} onClick={()=>{setAdminSection(key);setStatus('');}}><Icon size={20}/><span>{lang==='ru'?ru:en}</span></button>)}</nav>
          <header className="profile-admin-heading"><h1>{adminSections.find(item=>item.key===adminSection)?.[lang==='ru'?'ru':'en']}</h1><p>{lang==='ru'?({profile:'Имя, почта и пароль вашего аккаунта.',security:'Защита аккаунта, регистрация и правила доступа к музыке.',design:'Внешний вид и движения интерфейса.',maintenance:'Фоновые операции с аудио, обложками и данными Discogs.',content:'Загрузка музыки и способы редактирования коллекции.',users:'Зарегистрированные слушатели и управление доступом.'})[adminSection]:({profile:'Your account name, email and password.',security:'Account security, registration and music access.',design:'Appearance and motion of the website.',maintenance:'Background jobs for audio, artwork and Discogs data.',content:'Music uploads and collection editing.',users:'Registered listeners and access management.'})[adminSection]}</p></header>
        </>}
        <div className="profile-admin-overview" hidden={activeUser.role==='ADMIN'&&adminSection!=='profile'}>
        {activeUser.role!=='ADMIN'&&profileHero}

        <ProfilePasswordForm lang={lang}/>

        </div>
        <div className="profile-actions profile-admin-actions">
          {(activeUser.role!=='ADMIN'||adminSection==='design')&&<DancerSetting lang={lang}/>}
          {activeUser.role==='ADMIN'&&<>
            <section hidden={adminSection!=='security'} aria-label={lang==='ru'?'Настройки безопасности':'Security settings'}>
              <TwoFactorSettings lang={lang}/>
              <ProfileToggle checked={isRegistrationInviteRequired} label={lang==='ru'?'Пароль для регистрации':'Registration invite'} onChange={handleRegistrationInviteToggle} disabled={isSavingAuthSettings}>{lang==='ru'?'Пароль для регистрации':'Registration invite'}</ProfileToggle>
              <h2>{lang==='ru'?'Доступ к музыке':'Music access'}</h2>
              <ProfileToggle checked={playbackRequiresRegistration} label={lang==='ru'?'Треки только для зарегистрированных':'Playback requires registration'} onChange={handlePlaybackToggle} disabled={isSavingPlayback}>{lang==='ru'?'Треки только для зарегистрированных':'Playback requires registration'}</ProfileToggle>
              <ProfileToggle checked={allowGuestMixPlayback} label={lang==='ru'?'Миксы без регистрации':'Mixes without registration'} onChange={handleGuestMixPlaybackToggle} disabled={isSavingGuestMixPlayback}>{lang==='ru'?'Миксы без регистрации':'Mixes without registration'}</ProfileToggle>
            </section>
            <section hidden={adminSection!=='design'} aria-label={lang==='ru'?'Настройки дизайна сайта':'Site design settings'}><ShelfDesignSettings ru={lang==='ru'}/></section>
            <section hidden={adminSection!=='maintenance'} aria-label={lang==='ru'?'Обслуживание медиатеки':'Library maintenance'}>
              <button type="button" className={`profile-action-button${isSyncingDiscogs?' is-loading':''}`} onClick={handleDiscogsSync} disabled={isSyncingDiscogs} style={{['--profile-progress' as string]:`${discogsProgress}%`} as CSSProperties}><RefreshCw size={19}/><span>{isSyncingDiscogs?`${lang==='ru'?'Синхронизация':'Syncing'} ${discogsProgress}%`:lang==='ru'?'Синхронизировать Discogs':'Sync Discogs'}</span></button>
              <button type="button" className={`profile-action-button${isBackfillingWaveform?' is-loading':''}`} onClick={handleWaveformBackfill} disabled={isBackfillingWaveform} style={{['--profile-progress' as string]:`${waveformProgress}%`} as CSSProperties}><AudioLines size={19}/><span>{isBackfillingWaveform?`Waveform ${waveformProgress}%`:lang==='ru'?'Пересчитать waveform':'Recalculate waveform'}</span></button>
              <button type="button" className={`profile-action-button${isNormalizingAudio?' is-loading':''}`} onClick={handleNormalizeBackfill} disabled={isNormalizingAudio} style={{['--profile-progress' as string]:`${normalizeProgress}%`} as CSSProperties}><FileAudio size={19}/><span>{isNormalizingAudio?`MP3 ${normalizeProgress}%`:lang==='ru'?'Подготовить MP3':'Prepare MP3'}</span></button>
              <CoverMaintenance lang={lang}/>
            </section>
            <section hidden={adminSection!=='content'} aria-label={lang==='ru'?'Управление контентом':'Content management'}>
              <Link href="/upload" className="profile-action-button"><Upload size={19}/><span>{lang==='ru'?'Загрузить музыку':'Upload music'}</span></Link>
              <ProfileToggle checked={isAdminEditModeEnabled} label={lang==='ru'?'Редактирование с телефона':'Mobile editing'} onChange={handleAdminEditModeToggle}>{lang==='ru'?'Редактирование с телефона':'Mobile editing'}</ProfileToggle>
              <ProfileToggle checked={webEditMode} label={lang==='ru'?'Веб-редактирование релизов и миксов':'Web release and mix editing'} onChange={()=>setWebEditMode(!webEditMode)}>{lang==='ru'?'Веб-редактирование релизов и миксов':'Web release and mix editing'}</ProfileToggle>
            </section>
            <section hidden={adminSection!=='users'} aria-label={lang==='ru'?'Зарегистрированные пользователи':'Registered users'}>{usersLoading ? <p role="status">{lang==='ru'?'Загрузка…':'Loading…'}</p> : usersError ? <button type="button" onClick={()=>setUsersRetry(value=>value+1)}>{lang==='ru'?'Не удалось загрузить. Повторить':'Could not load. Retry'}</button> : <RegisteredUsersList users={registeredUsers} lang={lang}/>}</section>
          </>}
          {(activeUser.role!=='ADMIN'||adminSection==='profile')&&<button type="button" className="profile-action-button" onClick={handleLogout}>{lang==='ru'?'Выйти':'Logout'}</button>}
        </div>

        {status ? <p className="muted" role="status">{status}</p> : null}
      </article>

    </section>
  );
}
