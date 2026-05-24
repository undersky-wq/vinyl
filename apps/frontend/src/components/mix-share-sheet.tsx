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

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function wrapCanvasText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';

  words.forEach((word) => {
    const nextLine = line ? `${line} ${word}` : word;
    if (context.measureText(nextLine).width <= maxWidth) {
      line = nextLine;
      return;
    }

    if (line) {
      lines.push(line);
    }
    line = word;
  });

  if (line) {
    lines.push(line);
  }

  return lines.slice(0, 3);
}

async function createStoryFile(release: Release, coverUrl: string, url: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1920;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas is not available');
  }

  const image = await loadImage(coverUrl);

  context.fillStyle = '#111111';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.filter = 'blur(46px) saturate(1.15) brightness(0.72)';
  context.drawImage(image, -180, -120, 1440, 2160);
  context.restore();

  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0.18)');
  gradient.addColorStop(0.55, 'rgba(0, 0, 0, 0.12)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0.78)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const cardX = 92;
  const cardY = 1140;
  const cardWidth = 896;
  const cardHeight = 310;
  context.fillStyle = 'rgba(255, 255, 255, 0.16)';
  context.roundRect(cardX, cardY, cardWidth, cardHeight, 34);
  context.fill();

  context.drawImage(image, cardX + 42, cardY + 54, 202, 202);

  context.fillStyle = '#ffffff';
  context.font = '900 48px Arial';
  const titleLines = wrapCanvasText(context, release.title, 560);
  titleLines.forEach((line, index) => {
    context.fillText(line, cardX + 288, cardY + 92 + index * 56);
  });

  context.fillStyle = 'rgba(255, 255, 255, 0.72)';
  context.font = '700 38px Arial';
  context.fillText(release.artist, cardX + 288, cardY + 92 + titleLines.length * 56 + 10);

  context.fillStyle = 'rgba(255, 255, 255, 0.86)';
  context.font = '900 26px Arial';
  context.letterSpacing = '2px';
  context.fillText('VINYL COLLECTION', cardX + 288, cardY + 255);

  context.fillStyle = 'rgba(255, 255, 255, 0.78)';
  context.font = '700 28px Arial';
  context.fillText(url, 92, 1780);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((nextBlob) => {
      if (nextBlob) {
        resolve(nextBlob);
      } else {
        reject(new Error('Story image was not created'));
      }
    }, 'image/png');
  });

  return new File([blob], `mityadima-${release.id}-story.png`, { type: 'image/png' });
}

export function MixShareSheet({ release, url, isOpen, onClose, onCopy }: MixShareSheetProps) {
  const [backgroundIndex, setBackgroundIndex] = useState(0);
  const [isSharingStory, setIsSharingStory] = useState(false);

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

  async function handleStoryShare() {
    setIsSharingStory(true);
    try {
      const file = await createStoryFile(release, coverUrl, url);
      const shareData = {
        title,
        text: title,
        url,
        files: [file],
      };

      if (navigator.canShare?.(shareData) && navigator.share) {
        await navigator.share(shareData);
        return;
      }

      if (navigator.share) {
        await navigator.share({ title, text: title, url });
        return;
      }

      await onCopy();
    } catch {
      await handleNativeShare();
    } finally {
      setIsSharingStory(false);
    }
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

        <div className="mix-share-sheet__mobile-title">Share</div>
        <div className="mix-share-sheet__mobile-actions">
          <button type="button" onClick={() => void handleStoryShare()} disabled={isSharingStory}>
            <Send size={22} />
            Message
          </button>
          <button type="button" onClick={() => void onCopy()}>
            <Copy size={22} />
            Copy Link
          </button>
          <button type="button" onClick={() => void handleStoryShare()} disabled={isSharingStory}>
            <Send size={22} />
            Telegram
          </button>
          <button type="button" onClick={() => void handleStoryShare()} disabled={isSharingStory}>
            <MessageCircle size={22} />
            WhatsApp
          </button>
          <button type="button" onClick={() => void handleStoryShare()} disabled={isSharingStory}>
            <MessageCircle size={22} />
            Status
          </button>
          <button type="button" onClick={() => void handleStoryShare()} disabled={isSharingStory}>
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
