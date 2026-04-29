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
};

export function TrackUploadButton({ trackId, lang }: TrackUploadButtonProps) {
  const router = useRouter();
  const { user, requireAuth } = useAuth();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setError('');
    setIsUploading(true);

    try {
      await uploadTrackAudio(trackId, file);
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
      {error ? <span className="track-upload__status">{error}</span> : null}
    </div>
  );
}
