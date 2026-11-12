'use client';

import { useEffect, useId, useState } from 'react';
import { Copy, EyeOff, ImagePlus, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Release } from '../types';
import type { SiteLang } from '../lib/language';
import { copyReleaseGalleryImage, deleteReleaseGalleryImage, getRelease, getReleaseGalleryImageFile, removeReleaseBackCover, removeReleaseCover, saveReleaseGalleryImage, selectReleaseCover } from '../lib/api';
import { getBackCoverUrl, getSelectableReleaseImages, isBackCoverImage, vinylDisc } from '../lib/release-images';
import { SquareCoverEditor, SquareCoverInput } from './square-cover-input';

export function ReleaseGalleryEditor({ data, lang, busy, onChange, run, onEditingChange }: {
  data: Release; lang: SiteLang; busy: boolean; onChange: (release: Release) => void;
  run: (action: () => Promise<unknown>) => Promise<void>; onEditingChange: (editing: boolean) => void;
}) {
  const ru = lang === 'ru', uploadId = useId();
  const [second, setSecond] = useState(false);
  const [editing, setEditing] = useState<{ id: string; file: File } | null>(null);
  const [uploadEditing, setUploadEditing] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const gallery = getSelectableReleaseImages(data);
  const secondVinyl = second || data.tracks.some(track => vinylDisc(track.position) === 2) || gallery.some(image => image.isSecondFrontCover || image.isSecondBackCover);
  const sides = [
    { key: 'front' as const, disc: 1, letter: 'A', image: gallery.find(image => image.type === 'COVER'), url: data.coverStorageUrl || data.coverImageUrl || '' },
    { key: 'back' as const, disc: 1, letter: 'B', image: gallery.find(image => isBackCoverImage(data, image)), url: getBackCoverUrl(data) },
    ...(secondVinyl ? [
      { key: 'front2' as const, disc: 2, letter: 'A', image: gallery.find(image => image.isSecondFrontCover), url: data.secondCoverUrl || '' },
      { key: 'back2' as const, disc: 2, letter: 'B', image: gallery.find(image => image.isSecondBackCover), url: data.secondBackCoverUrl || '' },
    ] : []),
  ];
  const label = (side: typeof sides[number]) => ru ? `Пластинка ${side.disc} · сторона ${side.letter}` : `Record ${side.disc} · side ${side.letter}`;
  const disabled = busy || Boolean(loading);
  useEffect(() => { onEditingChange(Boolean(editing) || uploadEditing); }, [editing, uploadEditing, onEditingChange]);
  async function edit(id: string) {
    setLoading(id); setError('');
    try { setEditing({ id, file: await getReleaseGalleryImageFile(data.id, id) }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : (ru ? 'Не удалось открыть фото' : 'Could not open image')); }
    finally { setLoading(null); }
  }
  return <section className="shelf-form-gallery" aria-label={ru ? 'Галерея релиза' : 'Release gallery'}>
    <p>{ru ? 'Выбор обложек из галереи' : 'Choose covers from gallery'} <sup>{gallery.length}</sup></p>
    <div className="shelf-form-gallery__toolbar">
      <button type="button" disabled={disabled || Boolean(editing) || uploadEditing} onClick={() => document.getElementById(uploadId)?.click()}><ImagePlus size={16}/>{ru ? 'Загрузить ещё обложку' : 'Upload another cover'}</button>
      {!data.isMix && !secondVinyl && <button type="button" disabled={disabled} onClick={() => setSecond(true)}><Plus size={14}/>{ru ? 'Добавить пластинку 2 (A/B)' : 'Add record 2 (A/B)'}</button>}
    </div>
    <div className="shelf-form-covers">{gallery.map((image, index) => <figure key={image.id}>
      <a href={image.url} target="_blank" rel="noopener noreferrer" aria-label={ru ? `Открыть фото ${index + 1}` : `Open image ${index + 1}`}><picture><source media="(min-width:701px)" srcSet={image.url}/><img src={image.thumbUrl || image.url} alt={ru ? `Фото ${index + 1}` : `Image ${index + 1}`} width={112} height={112} loading="lazy" decoding="async"/></picture></a>
      <figcaption>{ru ? 'Фото' : 'Image'} {index + 1}</figcaption>
      <div className="shelf-form-gallery__actions">
        {sides.map(side => <div className="shelf-form-gallery__disc-side" key={side.key}>
          <button type="button" disabled={disabled || side.image?.id === image.id} aria-pressed={side.image?.id === image.id} onClick={() => void run(async () => onChange(await selectReleaseCover(data.id, image.id, side.key)))}>{label(side)}{side.image?.id === image.id ? ' ✓' : ''}</button>
          {side.image?.id === image.id && <button type="button" disabled={disabled} onClick={() => void run(async () => {
            if (side.key === 'front') await removeReleaseCover(data.id); else await removeReleaseBackCover(data.id, side.key);
            onChange(await getRelease(data.id));
          })}><EyeOff size={12}/>{ru ? 'Не показывать' : 'Hide cover'}</button>}
        </div>)}
        <button type="button" disabled={disabled || Boolean(editing) || uploadEditing} onClick={() => void edit(image.id)}><Pencil size={12}/>{loading === image.id ? '…' : ru ? 'Редактировать' : 'Edit'}</button>
        <button type="button" disabled={disabled} onClick={() => void run(async () => onChange(await copyReleaseGalleryImage(data.id, image.id)))}><Copy size={12}/>{ru ? 'Создать копию' : 'Make a copy'}</button>
        <button type="button" disabled={disabled} onClick={() => {
          if (confirm(ru ? 'Удалить это фото из галереи и хранилища? Если оно выбрано обложкой, сторона останется без фото.' : 'Delete this image from the gallery and storage? Any selected side using it will have no photo.')) {
            void run(async () => { onChange(await deleteReleaseGalleryImage(data.id, image.id, true)); if (editing?.id === image.id) setEditing(null); });
          }
        }}><Trash2 size={12}/>{ru ? 'Удалить' : 'Delete'}</button>
      </div>
    </figure>)}
    {sides.filter(side => !side.image).map(side => <figure key={side.key}>
      {side.url ? <img src={side.url} width={112} height={112} alt={label(side)}/> : <div className="shelf-form-cover-placeholder" aria-hidden="true"><ImagePlus size={26}/></div>}
      <figcaption>{label(side)}</figcaption>
      <p className="shelf-form-gallery__hint">{ru ? 'Выберите фото из галереи выше.' : 'Choose a photo from the gallery above.'}</p>
    </figure>)}
    </div>
    <SquareCoverInput id={uploadId} lang={lang} disabled={disabled || Boolean(editing)} showResultPreview={false} onEditingChange={setUploadEditing} onChange={file => void run(async () => onChange(await saveReleaseGalleryImage(data.id, file)))}/>
    {editing && <SquareCoverEditor file={editing.file} lang={lang} onCancel={() => setEditing(null)} onApply={file => run(async () => { onChange(await saveReleaseGalleryImage(data.id, file, editing.id)); setEditing(null); })}/>}
    {error && <p role="alert">{error}</p>}
    <p className="shelf-form-gallery__hint">{ru ? 'Скрытое фото остаётся в галерее. Копия редактируется независимо от оригинала.' : 'Hidden photos stay in the gallery. Copies can be edited independently.'}</p>
  </section>;
}
