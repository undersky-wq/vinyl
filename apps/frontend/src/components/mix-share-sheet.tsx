'use client';

import { Copy, Image as ImageIcon, Instagram, MessageCircle, Send, X } from 'lucide-react';
import { useState } from 'react';
import { Release } from '../types';

type MixShareSheetProps = {
  release: Release;
  url: string;
  isOpen: boolean;
  onClose: () => void;
  onCopy: () => Promise<void> | void;
};

const BACKGROUNDS = [
  { name: 'Blue dusk', value: 'linear-gradient(145deg, #6ea7e8 0%, #29445f 100%)' },
  { name: 'Sky', value: 'linear-gradient(145deg, #77b1f8 0%, #4d86db 100%)' },
  { name: 'Rust', value: 'linear-gradient(145deg, #d33d0d 0%, #442018 100%)' },
  { name: 'Graphite', value: 'linear-gradient(145deg, #2d2d2d 0%, #090909 100%)' },
];

function getCoverUrl(release: Release) {
  return (
    release.coverMediumStorageUrl ||
    release.coverStorageUrl ||
    release.coverThumbStorageUrl ||
    release.coverImageUrl ||
    '/icon.png'
  );
}

export function MixShareSheet({ release, url, isOpen, onClose, onCopy }: MixShareSheetProps) {
  const [backgroundIndex, setBackgroundIndex] = useState(0);

  if (!isOpen) {
    return null;
  }

  const coverUrl = getCoverUrl(release);
  const title = `${release.artist} - ${release.title}${release.year ? ` ${release.year}` : ''}`;

  async function handleNativeShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title, text: title, url });
        return;
      } catch {
        return;
      }
    }

    await onCopy();
  }

  return (
    <div className="mix-share-sheet" role="dialog" aria-modal="true" aria-label="Share mix">
      <button className="mix-share-sheet__backdrop" type="button" onClick={onClose} aria-label="Close share" />
      <div className="mix-share-sheet__panel">
        <button className="mix-share-sheet__close" type="button" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
        <span className="mix-share-sheet__handle" />

        <div className="mix-share-sheet__story" style={{ background: BACKGROUNDS[backgroundIndex].value }}>
          <img className="mix-share-sheet__blur-cover" src={coverUrl} alt="" aria-hidden="true" />
          <div className="mix-share-sheet__card">
            <div className="mix-share-sheet__art">
              <img src={coverUrl} alt={release.title} />
              <span className="mix-share-sheet__vinyl">
                <span style={{ backgroundImage: `url(${coverUrl})` }} />
              </span>
            </div>
            <strong>{release.title}</strong>
            <span>{release.artist}</span>
            <em>MIX</em>
            <small>VINYL COLLECTION</small>
          </div>
        </div>

        <div className="mix-share-sheet__palette" aria-label="Story background">
          <button type="button" className="mix-share-sheet__image" aria-label="Use cover colors">
            <ImageIcon size={18} />
          </button>
          {BACKGROUNDS.map((background, index) => (
            <button
              type="button"
              key={background.name}
              aria-label={background.name}
              className={`mix-share-sheet__swatch${backgroundIndex === index ? ' is-active' : ''}`}
              style={{ background: background.value }}
              onClick={() => setBackgroundIndex(index)}
            />
          ))}
        </div>

        <div className="mix-share-sheet__send-to" aria-label="Send to">
          <span>Send to</span>
          <div>
            {['v.k. / hot...', 'G-Blanka', 'Marussya...'].map((name, index) => (
              <button type="button" key={name} onClick={() => void handleNativeShare()}>
                <span style={{ backgroundImage: `url(${coverUrl})`, filter: index === 1 ? 'hue-rotate(80deg)' : undefined }} />
                {name}
              </button>
            ))}
          </div>
        </div>

        <div className="mix-share-sheet__mobile-title">Share</div>
        <div className="mix-share-sheet__mobile-actions">
          <button type="button" onClick={() => void handleNativeShare()}>
            <Send size={22} />
            Message
          </button>
          <button type="button" onClick={() => void onCopy()}>
            <Copy size={22} />
            Copy Link
          </button>
          <button type="button" onClick={() => void handleNativeShare()}>
            <Send size={22} />
            Telegram
          </button>
          <button type="button" onClick={() => void handleNativeShare()}>
            <MessageCircle size={22} />
            WhatsApp
          </button>
          <button type="button" onClick={() => void handleNativeShare()}>
            <MessageCircle size={22} />
            Status
          </button>
          <button type="button" onClick={() => void handleNativeShare()}>
            <Instagram size={22} />
            Stories
          </button>
        </div>

        <div className="mix-share-sheet__actions">
          <button type="button" onClick={() => void onCopy()}>
            <Copy size={18} />
            Copy link
          </button>
          <button type="button" onClick={() => void handleNativeShare()}>
            <Send size={18} />
            Share
          </button>
        </div>
      </div>
    </div>
  );
}
