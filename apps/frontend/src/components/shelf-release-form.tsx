'use client';

import { useEffect, useState } from 'react';
import { Plus, Save, Trash2, ImagePlus, EyeOff } from 'lucide-react';
import { createReleaseTrack, deleteReleaseTrack, deleteTrackAudio, deleteRelease, getRelease, removeReleaseCover, removeReleaseBackCover, updateReleaseMetadata, updateReleaseStyles, updateTrackMetadata, uploadReleaseBackCover, uploadReleaseCover } from '../lib/api';
import { Release } from '../types';
import { SiteLang } from '../lib/language';
import { TrackUploadButton } from './track-upload-button';
import { getBackCoverUrl, getSelectableReleaseImages, isBackCoverImage, vinylDisc } from '../lib/release-images';
import { selectReleaseCover, deleteReleaseGalleryImage } from '../lib/api';
import { SquareCoverInput } from './square-cover-input';

export function ShelfReleaseForm({ release, lang }: { release: Release; lang: SiteLang }) {
  const ru = lang === 'ru';
  const [data,setData] = useState(release);
  const [artist,setArtist] = useState(release.artist);
  const [title,setTitle] = useState(release.title);
  const [year,setYear] = useState(String(release.year || ''));
  const [styles,setStyles] = useState(release.styles.join(', '));
  const [newTitle,setNewTitle] = useState('');
  const [position,setPosition] = useState('');
  const [newArtist,setNewArtist] = useState('');
  const [busy,setBusy] = useState(false);
  const [status,setStatus] = useState('');
  const [showSecondVinyl,setShowSecondVinyl] = useState(false);
  useEffect(()=>{window.dispatchEvent(new CustomEvent('vinyl:release-artwork-updated',{detail:data}));},[data]);
  async function reload() { setData(await getRelease(release.id)); }
  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);setStatus(ru ? 'Сохранение…' : 'Saving…');
    try { await action();setStatus(ru ? 'Сохранено' : 'Saved'); }
    catch (error) { setStatus(error instanceof Error ? error.message : (ru ? 'Ошибка сохранения' : 'Save failed')); }
    finally { setBusy(false); }
  }
  const tracks=[...data.tracks].sort((a,b)=>(a.position||'').localeCompare(b.position||'',undefined,{numeric:true}));
  const backCoverUrl = getBackCoverUrl(data);
  const gallery = getSelectableReleaseImages(data);
  const secondVinyl = showSecondVinyl || data.tracks.some(track => vinylDisc(track.position) === 2)
    || Boolean(data.secondCoverUrl || data.secondBackCoverUrl || gallery.some(image => image.isSecondFrontCover || image.isSecondBackCover));
  const secondSides = [{ side: 'front2' as const, flag: 'isSecondFrontCover' as const, letter: 'A' }, { side: 'back2' as const, flag: 'isSecondBackCover' as const, letter: 'B' }];
  const coverLabel = (disc: 1 | 2, side: string) => ru ? `Пластинка ${disc} · сторона ${side}` : `Record ${disc} · side ${side}`;
  const uploadLabel = (disc: 1 | 2, side: string) => `${ru ? 'Загрузить обложку' : 'Upload cover'}: ${coverLabel(disc, side)}`;
  const hideLabel = (disc: 1 | 2, side: string) => `${ru ? 'Не показывать обложку' : 'Hide cover'}: ${coverLabel(disc, side)}`;
  function chooseCoverFile(side: 'front' | 'back' | 'front2' | 'back2') {
    if (!busy) (document.getElementById(`${side}-${data.id}`) as HTMLInputElement | null)?.click();
  }
  function hideCover(side: 'front' | 'back' | 'front2' | 'back2') {
    void run(async () => {
      if (side === 'front') await removeReleaseCover(data.id);
      else await removeReleaseBackCover(data.id, side);
      await reload();
    });
  }
  return <div className="shelf-release-form">
    <header>
      <div>
        <small>{data.isOriginal ? 'Tracks' : data.isMix ? (ru?'Микс':'Mix') : (ru?'Релиз':'Release')}</small><h2>{data.title}</h2><p>{data.artist}</p>
      </div>
    </header>
    <section className="shelf-form-gallery" aria-label={ru ? 'Галерея релиза' : 'Release gallery'}>
      <p>{ru ? 'Выбор обложек из галереи' : 'Choose covers from gallery'} <sup>{gallery.length}</sup></p>
      {!data.isMix && !secondVinyl && <button type="button" className="shelf-form-gallery__disc-toggle" disabled={busy} onClick={()=>setShowSecondVinyl(true)}><Plus size={14}/>{ru?'Добавить пластинку 2 (A/B)':'Add record 2 (A/B)'}</button>}
      {secondVinyl && <p className="shelf-form-gallery__hint">{ru?'Выберите фото для сторон A и B каждой пластинки.':'Choose a photo for sides A and B of each record.'}</p>}
      <div className="shelf-form-covers">{gallery.map((image, index) => <figure key={image.id}>
        <a href={image.url} target="_blank" rel="noopener noreferrer" aria-label={ru ? `Открыть фото ${index + 1} в полном размере` : `Open image ${index + 1} at full size`}>
          <picture><source media="(min-width:701px)" srcSet={image.url}/><img src={image.thumbUrl || image.url} alt={ru ? `Дополнительное фото ${index + 1}` : `Additional image ${index + 1}`} width={112} height={112} loading="lazy" decoding="async" /></picture>
        </a>
        <figcaption>{ru ? 'Фото' : 'Image'} {index + 1}</figcaption>
        <div className="shelf-form-gallery__actions">
          <button type="button" disabled={busy || image.type === 'COVER'} aria-pressed={image.type === 'COVER'} onClick={() => void run(async () => { setData(await selectReleaseCover(data.id, image.id, 'front')); })}>
            {coverLabel(1,'A')}{image.type === 'COVER' ? ' ✓' : ''}
          </button>
          {image.type === 'COVER' && <button type="button" className="shelf-form-cover" disabled={busy} onClick={()=>chooseCoverFile('front')} aria-label={uploadLabel(1,'A')}><ImagePlus size={12}/>{ru?'Загрузить с компьютера':'Upload from computer'}</button>}
          {image.type === 'COVER' && <button type="button" disabled={busy} onClick={()=>hideCover('front')} aria-label={hideLabel(1,'A')}><EyeOff size={12}/>{ru?'Не показывать обложку':'Hide cover'}</button>}
          <button type="button" disabled={busy || isBackCoverImage(data, image)} aria-pressed={isBackCoverImage(data, image)} onClick={() => void run(async () => { setData(await selectReleaseCover(data.id, image.id, 'back')); })}>
            {coverLabel(1,'B')}{isBackCoverImage(data, image) ? ' ✓' : ''}
          </button>
          {isBackCoverImage(data, image) && <>
            <button type="button" className="shelf-form-cover" disabled={busy} onClick={()=>chooseCoverFile('back')} aria-label={uploadLabel(1,'B')}><ImagePlus size={12}/>{ru?'Загрузить с компьютера':'Upload from computer'}</button>
            <button type="button" disabled={busy} onClick={()=>hideCover('back')} aria-label={hideLabel(1,'B')}><EyeOff size={12}/>{ru?'Не показывать обложку':'Hide cover'}</button>
          </>}
          {secondVinyl && secondSides.map(({side,flag,letter})=><div className="shelf-form-gallery__disc-side" key={side}>
            <button type="button" disabled={busy || image[flag] === true} aria-pressed={image[flag] === true} onClick={()=>void run(async()=>setData(await selectReleaseCover(data.id,image.id,side)))}>
              {coverLabel(2,letter)}{image[flag] ? ' ✓' : ''}
            </button>
            {image[flag] && <>
              <button type="button" className="shelf-form-cover" disabled={busy} onClick={()=>chooseCoverFile(side)} aria-label={uploadLabel(2,letter)}><ImagePlus size={12}/>{ru?'Загрузить с компьютера':'Upload from computer'}</button>
              <button type="button" disabled={busy} onClick={()=>hideCover(side)} aria-label={hideLabel(2,letter)}><EyeOff size={12}/>{ru?'Не показывать обложку':'Hide cover'}</button>
            </>}
          </div>)}
          <button type="button" disabled={busy || image.type === 'COVER' || image.url === data.coverStorageUrl || isBackCoverImage(data, image) || image.isSecondFrontCover || image.isSecondBackCover} onClick={() => {
            if (confirm(ru ? 'Удалить это фото из галереи и хранилища безвозвратно?' : 'Permanently delete this image from the gallery and storage?')) {
              void run(async () => { setData(await deleteReleaseGalleryImage(data.id, image.id)); });
            }
          }}><Trash2 size={12}/>{ru ? 'Удалить фото' : 'Delete image'}</button>
        </div>
      </figure>)}
      {(['front','back'] as const).filter(side=>!gallery.some(image=>side==='front'?image.type==='COVER':isBackCoverImage(data,image))).map(side=><figure key={`empty-${side}`}>
        {(side==='front'?(data.coverMediumStorageUrl || data.coverStorageUrl || data.coverImageUrl):backCoverUrl)
          ? <img src={(side==='front'?(data.coverMediumStorageUrl || data.coverStorageUrl || data.coverImageUrl):backCoverUrl)!} alt={coverLabel(1,side==='front'?'A':'B')} width={112} height={112}/>
          : <div className="shelf-form-cover-placeholder" aria-hidden="true"><ImagePlus size={26}/></div>}
        <figcaption>{coverLabel(1,side==='front'?'A':'B')}</figcaption>
        <div className="shelf-form-gallery__actions"><button type="button" className="shelf-form-cover" disabled={busy} onClick={()=>chooseCoverFile(side)} aria-label={uploadLabel(1,side==='front'?'A':'B')}><ImagePlus size={12}/>{ru?'Загрузить с компьютера':'Upload from computer'}</button></div>
      </figure>)}
      {secondVinyl && secondSides.filter(({flag})=>!gallery.some(image=>image[flag])).map(({side,letter})=><figure key={`empty-${side}`}>
        <div className="shelf-form-cover-placeholder" aria-hidden="true"><ImagePlus size={26}/></div>
        <figcaption>{coverLabel(2,letter)}</figcaption>
        <div className="shelf-form-gallery__actions"><button type="button" className="shelf-form-cover" disabled={busy} onClick={()=>chooseCoverFile(side)} aria-label={uploadLabel(2,letter)}><ImagePlus size={12}/>{ru?'Загрузить с компьютера':'Upload from computer'}</button></div>
      </figure>)}
      </div>
      <SquareCoverInput id={`front-${data.id}`} lang={lang} disabled={busy} showResultPreview={false} onChange={file => void run(async()=>setData(await uploadReleaseCover(data.id,file)))} />
      <SquareCoverInput id={`back-${data.id}`} lang={lang} disabled={busy} showResultPreview={false} onChange={file => void run(async()=>setData(await uploadReleaseBackCover(data.id,file)))} />
      {secondVinyl && secondSides.map(({side})=><SquareCoverInput key={side} id={`${side}-${data.id}`} lang={lang} disabled={busy} showResultPreview={false} onChange={file=>void run(async()=>setData(await uploadReleaseBackCover(data.id,file,side)))} />)}
      <p className="shelf-form-gallery__hint">{ru?'Скрытое фото остаётся в галерее. Чтобы вернуть его, выберите нужную пластинку и сторону.':'Hidden photos stay in the gallery. Select the record and side to show one again.'}</p>
    </section>
    <form className="shelf-form-metadata" onSubmit={event=>{event.preventDefault();void run(async()=>{await updateReleaseMetadata(data.id,{artist,title,year:year?Number(year):null});await updateReleaseStyles(data.id,[...new Set(styles.split(',').map(s=>s.trim()).filter(Boolean))]);await reload();});}}>
      <label>{ru?'Исполнитель':'Artist'}<input value={artist} required disabled={busy} onChange={event=>setArtist(event.target.value)}/></label>
      <label>{ru?'Название':'Title'}<input value={title} required disabled={busy} onChange={event=>setTitle(event.target.value)}/></label>
      <label>{ru?'Год':'Year'}<input type="number" value={year} disabled={busy} onChange={event=>setYear(event.target.value)}/></label>
      <label>{ru?'Стили / жанры (через запятую)':'Styles / genres (comma separated)'}<input value={styles} disabled={busy} onChange={event=>setStyles(event.target.value)}/></label>
      <button disabled={busy}><Save size={16}/>{ru?'Сохранить':'Save'}</button>
    </form>
    <div className="shelf-form-status" role="status" aria-live="polite">{status}</div>
    <h3>{ru?'Треки':'Tracks'} <sup>{tracks.length}</sup></h3>
    <div className="shelf-form-tracklist">{tracks.map(track=><div className="shelf-form-track" key={track.id}>
      <small>{track.position || '—'}</small>
      <div className="shelf-form-track-text"><input className="shelf-form-track-artist" aria-label={ru?'Исполнитель трека':'Track artist'} defaultValue={track.artists?.join(', ') || ''} placeholder={data.artist} disabled={busy} onBlur={event=>{const artists=event.target.value.split(',').map(s=>s.trim()).filter(Boolean);if(artists.join(',')!==(track.artists||[]).join(','))void run(async()=>{await updateTrackMetadata(track.id,{artists});await reload();});}}/>
      <input className="shelf-form-track-title" aria-label={ru?'Название трека':'Track title'} defaultValue={track.title} disabled={busy} onBlur={event=>{const value=event.target.value.trim();if(value&&value!==track.title)void run(async()=>{await updateTrackMetadata(track.id,{title:value});await reload();});}}/>
      <div className="shelf-form-track-analysis">
        <label>BPM<input key={`bpm-${track.bpm}`} type="number" min="1" step="any" aria-label="BPM" defaultValue={track.bpm ?? ''} placeholder="—" disabled={busy} onBlur={event=>{const raw=event.currentTarget.value.trim();const bpm=raw===''?null:Number(raw);if(bpm!==null&&(!Number.isFinite(bpm)||bpm<=0)){setStatus(ru?'BPM должен быть положительным числом':'BPM must be a positive number');return;}if(bpm!==(track.bpm??null))void run(async()=>{await updateTrackMetadata(track.id,{bpm});await reload();});}}/></label>
        <label>Key<input key={`key-${track.key}`} aria-label={ru?'Тональность':'Key'} defaultValue={track.key ?? ''} placeholder="8A / Am" disabled={busy} onBlur={event=>{const key=event.currentTarget.value.trim()||null;if(key!==(track.key??null))void run(async()=>{await updateTrackMetadata(track.id,{key});await reload();});}}/></label>
      </div></div>
      <div className="shelf-form-audio"><span className={track.audioFiles.length?'has-audio':''}>{track.audioFiles.length ? (ru?'MP3 загружен':'MP3 uploaded') : (ru?'Нет MP3':'No MP3')}</span><TrackUploadButton trackId={track.id} lang={lang} onUploaded={reload}/></div>
      <div className="shelf-form-track-actions">{track.audioFiles.length>0&&<button type="button" disabled={busy} aria-label={ru?'Удалить MP3':'Delete MP3'} onClick={()=>{if(confirm(ru?'Удалить MP3?':'Delete MP3?'))void run(async()=>{for(const file of track.audioFiles)await deleteTrackAudio(file.id);await reload();});}}><Trash2 size={15}/></button>}
      <button type="button" disabled={busy} aria-label={ru?'Удалить трек':'Delete track'} onClick={()=>{if(confirm(ru?`Удалить трек «${track.title}»?`:`Delete track “${track.title}”?`))void run(async()=>{await deleteReleaseTrack(track.id);await reload();});}}>×</button></div>
    </div>)}</div>
    <form className="shelf-form-add-track" onSubmit={event=>{event.preventDefault();void run(async()=>{await createReleaseTrack(data.id,{title:newTitle,position,artist:newArtist||undefined});setNewTitle('');setPosition('');setNewArtist('');await reload();});}}><input aria-label="Position" placeholder="A1" value={position} disabled={busy} onChange={event=>setPosition(event.target.value)}/><input aria-label={ru?'Новый трек':'New track'} placeholder={ru?'Название нового трека':'New track title'} value={newTitle} required disabled={busy} onChange={event=>setNewTitle(event.target.value)}/><input aria-label={ru?'Исполнитель':'Artist'} placeholder={ru?'Исполнитель':'Artist'} value={newArtist} disabled={busy} onChange={event=>setNewArtist(event.target.value)}/><button disabled={busy}><Plus size={16}/>{ru?'Добавить':'Add'}</button></form>
    <button type="button" className="shelf-form-delete" disabled={busy} onClick={()=>{if(confirm(ru?'Удалить релиз вместе с треками и файлами?':'Delete release, tracks and files?'))void run(async()=>{await deleteRelease(data.id);location.reload();});}}><Trash2 size={15}/>{ru?'Удалить релиз':'Delete release'}</button>
  </div>;
}
