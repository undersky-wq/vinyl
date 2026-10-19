'use client';

import { useEffect, useRef, useState } from 'react';
import { SiteLang } from '../lib/language';
import { squareCoverBounds } from '../lib/square-cover';
import './square-cover-input.css';

export function SquareCoverEditor({ file, lang, onApply, onCancel }: { file: File; lang: SiteLang; onApply: (file: File) => void; onCancel: () => void }) {
  const ru = lang === 'ru';
  const canvas = useRef<HTMLCanvasElement>(null);
  const image = useRef<HTMLImageElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [x, setX] = useState(50);
  const [y, setY] = useState(50);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (file.size > 20 * 1024 * 1024) { setLoaded(false); setError(ru ? 'Выберите изображение до 20 МБ.' : 'Choose an image under 20 MB.'); return; }
    const url = URL.createObjectURL(file);
    const next = new Image();
    let cancelled = false;
    setLoaded(false); setError(''); setX(50); setY(50); setZoom(1);
    next.onload = () => { if (!cancelled) { image.current = next; setLoaded(true); } };
    next.onerror = () => { if (!cancelled) setError(ru ? 'Не удалось открыть изображение.' : 'Could not open image.'); };
    next.src = url;
    return () => { cancelled = true; URL.revokeObjectURL(url); image.current = null; };
  }, [file, ru]);
  useEffect(() => {
    const source = image.current;
    const context = canvas.current?.getContext('2d');
    if (!loaded || !source || !context) return;
    const crop = squareCoverBounds(source.naturalWidth, source.naturalHeight, x, y, zoom);
    context.clearRect(0, 0, 320, 320);
    context.drawImage(source, crop.x, crop.y, crop.side, crop.side, 0, 0, 320, 320);
  }, [loaded, x, y, zoom]);

  async function apply() {
    const source = image.current;
    if (!source || saving) return;
    setSaving(true); setError('');
    try {
      const crop = squareCoverBounds(source.naturalWidth, source.naturalHeight, x, y, zoom);
      const result = document.createElement('canvas');
      result.width = result.height = Math.min(1600, Math.max(1, Math.floor(crop.side)));
      const context = result.getContext('2d');
      if (!context) throw new Error('Canvas unavailable');
      context.fillStyle = '#fff'; context.fillRect(0, 0, result.width, result.height);
      context.imageSmoothingQuality = 'high';
      context.drawImage(source, crop.x, crop.y, crop.side, crop.side, 0, 0, result.width, result.height);
      const blob = await new Promise<Blob | null>(resolve => result.toBlob(resolve, 'image/jpeg', .94));
      if (!blob) throw new Error('Image export failed');
      onApply(new File([blob], `${file.name.replace(/\.[^.]+$/, '')}-square.jpg`, { type: 'image/jpeg' }));
    } catch { setError(ru ? 'Не удалось подготовить обложку. Попробуйте другой файл.' : 'Could not prepare cover. Try another file.'); }
    finally { setSaving(false); }
  }
  return <section className="square-cover-editor" aria-label={ru ? 'Квадратная область обложки' : 'Square cover area'}>
    <strong>{ru ? 'Что будет видно на обложке' : 'Cover preview'}</strong>
    <canvas ref={canvas} width={320} height={320} aria-label={ru ? 'Предпросмотр квадратной обложки' : 'Square cover preview'} />
    <p>{ru ? 'Выберите область ползунками. Пропорции фотографии не искажаются.' : 'Adjust the area with the sliders. The photo keeps its proportions.'}</p>
    {([
      [ru ? 'По горизонтали' : 'Horizontal', x, setX, 0, 100, 1],
      [ru ? 'По вертикали' : 'Vertical', y, setY, 0, 100, 1],
      [ru ? 'Масштаб' : 'Zoom', zoom, setZoom, 1, 3, .01],
    ] as const).map(([label, value, set, min, max, step]) => <label key={label}>{label}<input type="range" min={min} max={max} step={step} value={value} disabled={!loaded || saving} onChange={event => set(Number(event.target.value))} /></label>)}
    <div className="square-cover-editor__actions">
      <button type="button" disabled={!loaded || saving} onClick={() => void apply()}>{saving ? '…' : ru ? 'Применить квадрат' : 'Apply square'}</button>
      <button type="button" disabled={saving} onClick={onCancel}>{ru ? 'Отмена' : 'Cancel'}</button>
    </div>
    {error ? <p role="status">{error}</p> : null}
  </section>;
}

export function SquareCoverInput({ id, lang, disabled, onChange, currentUrl, onEditingChange }: { id?: string; lang: SiteLang; disabled?: boolean; onChange: (file: File) => void; currentUrl?: string; onEditingChange?: (editing: boolean) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { onEditingChange?.(Boolean(file)); }, [file, onEditingChange]);
  return <div className="square-cover-control">
    <input id={id} type="file" accept="image/jpeg,image/png,image/webp" className="file-input" disabled={disabled || loading} onChange={event => {
      const selected = event.currentTarget.files?.[0]; event.currentTarget.value = '';
      if (selected) { setError(''); setFile(selected); }
    }} />
    {name ? <span className="square-cover-control__name">{name}</span> : null}
    {currentUrl ? <button type="button" disabled={disabled || loading} onClick={async () => {
      setLoading(true); setError('');
      try {
        const url = new URL(currentUrl, window.location.origin);
        url.searchParams.set('v', String(Date.now()));
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) throw new Error('Image unavailable');
        const blob = await response.blob();
        setFile(new File([blob], 'cover.jpg', { type: blob.type }));
      } catch { setError(lang === 'ru' ? 'Не удалось открыть текущую обложку. Выберите файл.' : 'Could not open current cover. Choose a file.'); }
      finally { setLoading(false); }
    }}>{loading ? '…' : lang === 'ru' ? 'Настроить текущую обложку' : 'Adjust current cover'}</button> : null}
    {file ? <SquareCoverEditor key={`${file.name}-${file.lastModified}`} file={file} lang={lang} onCancel={() => setFile(null)} onApply={next => { setName(next.name); setFile(null); onChange(next); }} /> : null}
    {error ? <p role="status">{error}</p> : null}
  </div>;
}
