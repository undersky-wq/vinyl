'use client';

import dynamic from 'next/dynamic';
import { Pencil, X, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getRelease } from '../lib/api';
import { SiteLang } from '../lib/language';
import { Release } from '../types';
import { useAuth } from '../providers/auth-provider';
import { useWebEditMode } from './admin-edit-mode-sync';

const Detail = dynamic(() => import('./shelf-release-form').then(module => module.ShelfReleaseForm), { ssr: false });

export function ShelfReleaseEditor({ id, lang, className = '' }: { id: string; lang: SiteLang; className?: string }) {
  const { user } = useAuth();
  const enabled = useWebEditMode();
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [release, setRelease] = useState<Release | null>(null);
  const [error, setError] = useState(false);
  const [removing, setRemoving] = useState(false);
  const allowed = user?.role === 'ADMIN' && enabled;
  useEffect(() => {
    if (!open || !allowed) { dialog.current?.close(); return; }
    let cancelled = false;
    dialog.current?.showModal();
    setRelease(null); setError(false);
    void getRelease(id).then(data => { if (!cancelled) setRelease(data); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [open, allowed, id]);
  if (!allowed) return null;
  function close() {
    setOpen(false);
    router.refresh();
    window.dispatchEvent(new Event('vinyl:release-updated'));
  }
  async function removeCover() {
    if (!allowed || removing || !confirm(lang === 'ru' ? 'Убрать обложку релиза? Исходный файл останется на диске.' : 'Remove release cover? The original file will remain on disk.')) return;
    setRemoving(true);
    try {
      const response = await fetch(`/api/releases/${encodeURIComponent(id)}/cover`, { method:'DELETE', credentials:'include' });
      if (!response.ok) throw new Error('Cover removal failed');
      close();
    } catch { alert(lang === 'ru' ? 'Не удалось убрать обложку.' : 'Could not remove cover.'); }
    finally { setRemoving(false); }
  }
  return <>
    <button type="button" className={`shelf-edit-trigger ${className}`} aria-label={lang === 'ru' ? 'Редактировать релиз' : 'Edit release'} onClick={event => { event.stopPropagation(); setOpen(true); }}><Pencil size={16}/></button>
    <dialog className="shelf-editor" ref={dialog} aria-label={lang === 'ru' ? 'Редактирование релиза' : 'Release editor'} onCancel={close} onClose={() => setOpen(false)} onClick={event => event.stopPropagation()}>
      <button type="button" className="shelf-editor-close" aria-label={lang === 'ru' ? 'Закрыть' : 'Close'} onClick={close}><X size={22}/></button>
      {release && <button type="button" className="shelf-edit-trigger" disabled={removing} onClick={() => void removeCover()}><Trash2 size={16}/> {lang === 'ru' ? 'Убрать обложку' : 'Remove cover'}</button>}
      {open && (release ? <Detail key={release.id} release={release} lang={lang}/> : <p>{error ? (lang === 'ru' ? 'Не удалось загрузить релиз. Закройте окно и попробуйте снова.' : 'Could not load release. Close and retry.') : (lang === 'ru' ? 'Загрузка…' : 'Loading…')}</p>)}
    </dialog>
  </>;
}
