'use client';

import { useEffect, useRef, useState } from 'react';
import { SiteLang } from '../lib/language';
import { drawSquareCover, squareCoverTransform } from '../lib/square-cover';
import './square-cover-input.css';

export function SquareCoverEditor({ file, lang, onApply, onCancel }: { file: File; lang: SiteLang; onApply: (file: File) => void | Promise<void>; onCancel: () => void }) {
  const ru = lang === 'ru';
  const canvas = useRef<HTMLCanvasElement>(null);
  const image = useRef<HTMLImageElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [x, setX] = useState(50);
  const [y, setY] = useState(50);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (file.size > 20 * 1024 * 1024) { setLoaded(false); setError(ru ? 'Выберите изображение до 20 МБ.' : 'Choose an image under 20 MB.'); return; }
    const url = URL.createObjectURL(file);
    const next = new Image();
    let cancelled = false;
    setLoaded(false); setError(''); setX(50); setY(50); setZoom(1); setRotation(0);
    next.onload = () => { if (!cancelled) { image.current = next; setLoaded(true); } };
    next.onerror = () => { if (!cancelled) setError(ru ? 'Не удалось открыть изображение.' : 'Could not open image.'); };
    next.src = url;
    return () => { cancelled = true; URL.revokeObjectURL(url); image.current = null; };
  }, [file, ru]);
  useEffect(() => {
    const source = image.current;
    const context = canvas.current?.getContext('2d');
    if (!loaded || !source || !context) return;
    drawSquareCover(context, source, 320, x, y, zoom, rotation);
  }, [loaded, x, y, zoom, rotation]);

  async function apply() {
    const source = image.current;
    if (!source || saving) return;
    setSaving(true); setError('');
    try {
      const crop = squareCoverTransform(source.naturalWidth, source.naturalHeight, x, y, zoom, rotation);
      const result = document.createElement('canvas');
      result.width = result.height = Math.min(1600, Math.max(1, Math.floor(crop.side)));
      const context = result.getContext('2d');
      if (!context) throw new Error('Canvas unavailable');
      drawSquareCover(context, source, result.width, x, y, zoom, rotation);
      const blob = await new Promise<Blob | null>(resolve => result.toBlob(resolve, 'image/jpeg', .94));
      if (!blob) throw new Error('Image export failed');
      await onApply(new File([blob], `${file.name.replace(/\.[^.]+$/, '')}-square.jpg`, { type: 'image/jpeg' }));
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
      [ru ? 'Поворот' : 'Rotation', rotation, setRotation, -180, 180, 1],
    ] as const).map(([label, value, set, min, max, step]) => <label key={label}>{label}<input type="range" min={min} max={max} step={step} value={value} disabled={!loaded || saving} onChange={event => set(Number(event.target.value))} /></label>)}
    <div className="square-cover-editor__rotation"><button type="button" disabled={!loaded || saving} onClick={()=>setRotation(value=>(value+450)%360-180)}>{ru?'На 90° влево':'90° left'}</button><output>{rotation}°</output><button type="button" disabled={!loaded || saving} onClick={()=>setRotation(value=>(value+630)%360-180)}>{ru?'На 90° вправо':'90° right'}</button></div>
    <div className="square-cover-editor__actions">
      <button type="button" disabled={!loaded || saving} onClick={() => void apply()}>{saving ? '…' : ru ? 'Применить квадрат' : 'Apply square'}</button>
      <button type="button" disabled={saving} onClick={onCancel}>{ru ? 'Отмена' : 'Cancel'}</button>
    </div>
    {error ? <p role="status">{error}</p> : null}
  </section>;
}

export function SquareCoverInput({ id, lang, disabled, onChange, currentUrl, onEditingChange, showResultPreview = true }: { id?: string; lang: SiteLang; disabled?: boolean; onChange: (file: File) => void; currentUrl?: string; onEditingChange?: (editing: boolean) => void; showResultPreview?: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const previewRef = useRef('');
  useEffect(() => () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current); }, []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { onEditingChange?.(Boolean(file)); }, [file, onEditingChange]);
  return <div className="square-cover-control">
    <input id={id} type="file" accept="image/jpeg,image/png,image/webp" className="file-input" disabled={disabled || loading} onChange={event => {
      const selected = event.currentTarget.files?.[0]; event.currentTarget.value = '';
      if (selected) { setError(''); setFile(selected); }
    }} />
    {showResultPreview && name ? <span className="square-cover-control__name">{name}</span> : null}
    {showResultPreview && previewUrl ? <figure className="square-cover-control__result"><img src={previewUrl} width={320} height={320} alt={lang === 'ru' ? 'Итоговая обложка после обрезки' : 'Final cropped cover'} /><figcaption>{lang === 'ru' ? 'Эта обложка будет загружена' : 'This cover will be uploaded'}</figcaption></figure> : null}
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
    {file ? <SquareCoverEditor key={`${file.name}-${file.lastModified}`} file={file} lang={lang} onCancel={() => setFile(null)} onApply={next => { if (previewRef.current) URL.revokeObjectURL(previewRef.current); previewRef.current = showResultPreview ? URL.createObjectURL(next) : ''; setPreviewUrl(previewRef.current); setName(next.name); setFile(null); onChange(next); }} /> : null}
    {error ? <p role="status">{error}</p> : null}
  </div>;
}
