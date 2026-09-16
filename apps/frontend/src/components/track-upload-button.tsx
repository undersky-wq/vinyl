'use client';

import { LoaderCircle, Upload } from 'lucide-react';
import { ChangeEvent, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SiteLang } from '../lib/language';
import { uploadTrackAudio } from '../lib/api';
import { useAuth } from '../providers/auth-provider';

type TrackUploadButtonProps = {
  trackId: string;
  lang: SiteLang;
  onUploaded?: () => void | Promise<void>;
};

export function TrackUploadButton({ trackId, lang, onUploaded }: TrackUploadButtonProps) {
  const router = useRouter();
  const { user, requireAuth } = useAuth();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [uploaded, setUploaded] = useState(false);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setError('');
    setIsUploading(true);
    setProgress(0);setUploaded(false);

    try {
      await uploadTrackAudio(trackId, file, setProgress);
      setUploaded(true);
      if (onUploaded) {
        try { await onUploaded(); }
        catch { setError(lang === 'ru' ? 'MP3 загружен, обновите статус трека.' : 'MP3 uploaded; refresh track status.'); }
      }
      router.refresh();
    } catch {
      setError(lang === 'ru' ? 'Ошибка загрузки' : 'Upload failed');
    } finally {
      setIsUploading(false);
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  }

  return (
    <div className="track-upload">
      <input
        ref={inputRef}
        type="file"
        accept=".mp3,audio/mpeg,audio/mp3"
        className="track-upload__input"
        onChange={handleFileChange}
      />
      <button
        type="button"
        className={`track-upload-button track-upload-button--icon${isUploading ? ' is-uploading' : ''}`}
        disabled={isUploading || user?.role !== 'ADMIN'}
        onClick={() => {
          if (!requireAuth()) {
            return;
          }

          if (user?.role !== 'ADMIN') {
            setError(lang === 'ru' ? 'Только администратор может загружать MP3.' : 'Only admin can upload MP3.');
            return;
          }

          inputRef.current?.click();
        }}
        aria-label={
          isUploading
            ? lang === 'ru'
              ? 'Загрузка файла'
              : 'Uploading file'
            : lang === 'ru'
              ? 'Загрузить MP3'
              : 'Upload MP3'
        }
        title={
          isUploading
            ? lang === 'ru'
              ? 'Загрузка...'
              : 'Uploading...'
            : lang === 'ru'
              ? 'Загрузить MP3'
              : 'Upload MP3'
        }
      >
        {isUploading ? <LoaderCircle size={16} className="track-upload-button__spinner" /> : <Upload size={16} />}
      </button>
      <span className="track-upload__feedback" role="status" aria-live="polite">
        {isUploading ? (progress >= 100 ? (lang === 'ru' ? 'Обработка…' : 'Processing…') : `${progress}%`) : uploaded ? (lang === 'ru' ? 'Загружено' : 'Uploaded') : ''}
      </span>
      {isUploading && <progress className="track-upload__progress" max={100} value={progress} aria-label={lang === 'ru' ? 'Передача MP3' : 'MP3 upload'}/>}
      {error ? <span className="track-upload__status" role="alert">{error}</span> : null}
    </div>
  );
}
