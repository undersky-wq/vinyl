'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { createReleaseTrack, deleteReleaseTrack, deleteTrackAudio, deleteRelease, getRelease, updateReleaseMetadata, updateReleaseStyles, updateTrackMetadata } from '../lib/api';
import { Release } from '../types';
import { SiteLang } from '../lib/language';
import { TrackUploadButton } from './track-upload-button';
import { ReleaseGalleryEditor } from './release-gallery-editor';

export function ShelfReleaseForm({ release, lang }: { release: Release; lang: SiteLang }) {
  const ru = lang === 'ru';
  const [data,setData] = useState(release);
  const [artist,setArtist] = useState(release.artist);
  const [title,setTitle] = useState(release.title);
  const [labels,setLabels] = useState((release.labels || []).join(', '));
  const [year,setYear] = useState(String(release.year || ''));
  const [styles,setStyles] = useState(release.styles.join(', '));
  const [newTitle,setNewTitle] = useState('');
  const [position,setPosition] = useState('');
  const [newArtist,setNewArtist] = useState('');
  const [busy,setBusy] = useState(false);
  const [status,setStatus] = useState('');
  const [isCoverEditing,setIsCoverEditing] = useState(false);
  const [savingMetadata,setSavingMetadata] = useState(false);
  const metadataFormId = useId();
  const queue = useRef(Promise.resolve<unknown>(undefined));
  const jobs = useRef(0);
  useEffect(()=>{window.dispatchEvent(new CustomEvent('vinyl:release-artwork-updated',{detail:data}));},[data]);
  async function reload() { setData(await getRelease(release.id)); }
  async function run(action: () => Promise<unknown>) {
    jobs.current++;
    setBusy(true);setStatus(ru ? 'Сохранение…' : 'Saving…');
    const job = queue.current.then(action);
    queue.current = job.catch(() => undefined);
    try { await job;if (jobs.current === 1) setStatus(ru ? 'Сохранено' : 'Saved'); }
    catch (error) { setStatus(error instanceof Error ? error.message : (ru ? 'Ошибка сохранения' : 'Save failed')); }
    finally { if (--jobs.current === 0) setBusy(false); }
  }
  const tracks=[...data.tracks].sort((a,b)=>(a.position||'').localeCompare(b.position||'',undefined,{numeric:true}));

  return <div className="shelf-release-form">
    <header>
      <div>
        <small>{data.isOriginal ? 'Tracks' : data.isMix ? (ru?'Микс':'Mix') : (ru?'Релиз':'Release')}</small><h2>{data.title}</h2><p>{data.artist}</p>
      </div>
    </header>
    <ReleaseGalleryEditor data={data} lang={lang} busy={busy} onChange={setData} run={run} onEditingChange={setIsCoverEditing}/>
    <form id={metadataFormId} className="shelf-form-metadata" onSubmit={event=>{event.preventDefault();if(savingMetadata)return;setSavingMetadata(true);void run(async()=>{await updateReleaseMetadata(data.id,{artist,title,labels:[...new Set(labels.split(',').map(label=>label.trim()).filter(Boolean))],year:year?Number(year):null});await updateReleaseStyles(data.id,[...new Set(styles.split(',').map(s=>s.trim()).filter(Boolean))]);await reload();}).finally(()=>setSavingMetadata(false));}}>
      <label>{ru?'Исполнитель':'Artist'}<input value={artist} required disabled={busy} onChange={event=>setArtist(event.target.value)}/></label>
      <label>{ru?'Название':'Title'}<input value={title} required disabled={busy} onChange={event=>setTitle(event.target.value)}/></label>
      <label>{ru?'Лейблы (через запятую)':'Labels (comma separated)'}<input value={labels} disabled={busy} onChange={event=>setLabels(event.target.value)}/></label>
      <label>{ru?'Год':'Year'}<input type="number" value={year} disabled={busy} onChange={event=>setYear(event.target.value)}/></label>
      <label>{ru?'Стили / жанры (через запятую)':'Styles / genres (comma separated)'}<input value={styles} disabled={busy} onChange={event=>setStyles(event.target.value)}/></label>
    </form>
    <div className="shelf-form-status" role="status" aria-live="polite">{status}</div>
    <h3>{ru?'Треки':'Tracks'} <sup>{tracks.length}</sup></h3>
    <div className="shelf-form-tracklist">{tracks.map(track=><div className="shelf-form-track" key={track.id}>
      <input className="shelf-form-track-position" key={`position-${track.position}`} aria-label={ru?'Сторона и номер трека':'Track side and number'} data-site-tooltip={ru?'Сторона и номер трека, например B1':'Track side and number, e.g. B1'} defaultValue={track.position || ''} placeholder="A1" maxLength={32} disabled={busy} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();event.currentTarget.blur();}}} onBlur={event=>{const input=event.currentTarget;const position=input.value.trim();if(!position){input.value=track.position||'';setStatus(ru?'Укажите сторону и номер трека, например B1':'Enter the track side and number, e.g. B1');return;}if(position!==(track.position||''))void run(async()=>{try{await updateTrackMetadata(track.id,{position});await reload();}catch(error){input.value=track.position||'';throw error;}});}}/>
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
    <div className="shelf-form-footer"><button type="submit" form={metadataFormId} disabled={savingMetadata || isCoverEditing} aria-busy={savingMetadata}><Save size={16}/>{savingMetadata ? (ru?'Сохранение…':'Saving…') : (ru?'Сохранить':'Save')}</button></div>
  </div>;
}
