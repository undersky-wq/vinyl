'use client';

import { useEffect, useState } from 'react';
import { coverMaintenanceRequest, type CoverMaintenanceStatus } from '../lib/cover-maintenance';
import type { SiteLang } from '../lib/language';
import './cover-maintenance.css';

export function CoverMaintenance({ lang }: { lang: SiteLang }) {
  const ru = lang === 'ru';
  const [open, setOpen] = useState(false);
  const [job, setJob] = useState<CoverMaintenanceStatus | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const running = job?.status === 'running';
  useEffect(() => {
    if (!open) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const status = await coverMaintenanceRequest('status');
        if (disposed) return;
        setJob(status); setError('');
        if (status.status === 'running') timer = setTimeout(refresh, 1500);
      } catch {
        if (!disposed) {
          setError(ru ? 'Нет связи с сервером. Результат пока неизвестен.' : 'Server unavailable. The result is not yet known.');
          timer = setTimeout(refresh, 5000);
        }
      }
    };
    void refresh();
    return () => { disposed = true; clearTimeout(timer); };
  }, [open, running, ru]);

  async function start(action: 'check' | 'convert') {
    if (pending || running) return;
    setPending(true); setError('');
    try {
      setJob(await coverMaintenanceRequest(action));
    } catch {
      setError(ru ? 'Не удалось подтвердить запуск. Проверьте состояние повторно.' : 'Could not confirm the start. Reopen to check the status.');
    } finally { setPending(false); }
  }
  const percent = job?.total ? Math.min(100, Math.round(job.processed / job.total * 100)) : 0;
  const saved = Math.max(0, (job?.bytesBefore || 0) - (job?.bytesAfter || 0));
  return <div className="cover-maintenance">
    <button type="button" className="profile-action-button" aria-expanded={open} aria-controls="cover-maintenance-panel" onClick={() => setOpen(value => !value)}>
      <span className="profile-action-button__label">{ru ? 'Проверка и оптимизация обложек' : 'Check and optimize covers'}</span>
      <span aria-hidden="true">{open ? '\u2212' : '+'}</span>
    </button>
    {open && <section id="cover-maintenance-panel" className="cover-maintenance__panel" aria-label={ru ? 'Оптимизация обложек' : 'Cover optimization'}>
      <p>{ru ? 'Проверяются основные обложки, все стороны, галерея и миниатюры коллекции, миксов и треков.' : 'Checks primary covers, all sides, galleries and thumbnails across the collection, mixes and tracks.'}</p>
      <p>{ru ? 'Преобразование: WebP, качество 90, без уменьшения разрешения. Исходники сохраняются. Анимации и файлы, которые не станут меньше, пропускаются.' : 'Conversion: WebP quality 90, without reducing resolution. Originals are kept. Animations and files that would not become smaller are skipped.'}</p>
      <div className="cover-maintenance__actions">
        <button type="button" className="profile-action-button" disabled={pending || running} onClick={() => void start('check')}>{ru ? 'Проверить обложки' : 'Check covers'}</button>
        <button type="button" className="profile-action-button" disabled={pending || running} onClick={() => void start('convert')}>{ru ? 'Преобразовать в WebP' : 'Convert to WebP'}</button>
      </div>
      {(pending || running) && <p role="status">{pending ? (ru ? 'Запуск...' : 'Starting...') : `${job?.mode === 'convert' ? (ru ? 'Преобразование' : 'Converting') : (ru ? 'Проверка' : 'Checking')} ${job?.processed} / ${job?.total} (${percent}%)`}</p>}
      {running && <progress max={100} value={percent} aria-label={ru ? 'Прогресс обработки обложек' : 'Cover processing progress'} />}
      {job && job.status !== 'idle' && <div className="cover-maintenance__report" aria-live="polite">
        <p>{job.status === 'completed' ? (ru ? 'Обработка завершена' : 'Processing completed') : job.status === 'failed' ? (ru ? 'Обработка прервана с ошибкой' : 'Processing failed') : ''}</p>
        {job.mode === 'convert' && <p>{ru ? 'Форматы до преобразования:' : 'Formats before conversion:'}</p>}
        <p>{ru ? 'Файлов' : 'Files'}: {job.total}. WebP: {job.webp}. {ru ? 'Других форматов' : 'Other formats'}: {job.other}.</p>
        <p>{Object.entries(job.formats).map(([format, count]) => `${format.toUpperCase()}: ${count}`).join(' / ')}</p>
        {job.mode === 'convert' && <p>{ru ? 'Преобразовано' : 'Converted'}: {job.converted}. {ru ? 'Пропущено' : 'Skipped'}: {job.skipped}. {ru ? 'Изменены в редакторе, не затронуты' : 'Changed in editor, left untouched'}: {job.stale}. {ru ? 'Экономия' : 'Saved'}: {(saved / 1048576).toFixed(2)} MB.</p>}
        {!!job.withoutStorageKey && <p>{ru ? 'Внешние обложки без файла в хранилище, не преобразованы' : 'External covers without a stored file, not converted'}: {job.withoutStorageKey}.</p>}
        <p>{ru ? 'Ошибок' : 'Errors'}: {job.failed}.</p>
        {!!job.errors.length && <details><summary>{ru ? 'Файлы с ошибками' : 'Files with errors'}</summary><ul>{job.errors.map((item, index) => <li key={index}>{item.key || item.message}</li>)}</ul></details>}
      </div>}
      <p className="muted">{ru ? 'Можно закрыть панель: обработка продолжится. При перезапуске сервера задачу потребуется запустить заново.' : 'You can close this panel while processing continues. Restart the job after a server restart.'}</p>
      {error && <p role="alert">{error}</p>}
    </section>}
  </div>;
}
