'use client';

import { MouseEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import WaveSurfer from 'wavesurfer.js';
import { SiteLang } from '../lib/language';
import { PlayerTrack, usePlayer } from '../providers/player-provider';

type WaveformPlayerProps = {
  lang: SiteLang;
  tracks: PlayerTrack[];
};

export function WaveformPlayer({ lang, tracks }: WaveformPlayerProps) {
  const {
    currentTrack,
    currentTime,
    duration,
    isPlaying,
    seekToPercent,
    togglePlayback,
    playQueue,
  } = usePlayer();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const waveRef = useRef<WaveSurfer | null>(null);
  const activeUrlRef = useRef<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  const currentTrackOnPage = useMemo(() => {
    if (!currentTrack) {
      return null;
    }

    return tracks.find((track) => track.id === currentTrack.id) || null;
  }, [currentTrack, tracks]);

  const activeTrack = currentTrackOnPage || tracks[0] || null;

  useEffect(() => {
    if (!containerRef.current || waveRef.current) {
      return;
    }

    const wave = WaveSurfer.create({
      container: containerRef.current,
      waveColor: 'rgba(255,255,255,0.18)',
      progressColor: '#756096',
      cursorColor: '#9a84ba',
      cursorWidth: 2,
      barWidth: 3,
      barGap: 2,
      height: 120,
      normalize: true,
      interact: false,
    });

    waveRef.current = wave;

    const unsubscribeReady = wave.on('ready', () => {
      setIsReady(true);
    });

    return () => {
      try {
        unsubscribeReady();
      } catch (error) {
        console.warn('Waveform unsubscribe failed', error);
      }

      try {
        wave.destroy();
      } catch (error) {
        console.warn('Waveform cleanup failed', error);
      } finally {
        waveRef.current = null;
        activeUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const wave = waveRef.current;
    if (!wave || !activeTrack?.audioUrl) {
      return;
    }

    if (activeUrlRef.current === activeTrack.audioUrl) {
      return;
    }

    setIsReady(false);
    activeUrlRef.current = activeTrack.audioUrl;

    try {
      wave.load(activeTrack.audioUrl);
    } catch (error) {
      console.warn('Waveform load failed', error);
    }
  }, [activeTrack?.audioUrl]);

  useEffect(() => {
    const wave = waveRef.current;
    if (!wave || !isReady || !currentTrackOnPage) {
      return;
    }

    try {
      wave.setTime(currentTime);
    } catch (error) {
      console.warn('Waveform sync failed', error);
    }
  }, [currentTime, isReady, currentTrackOnPage]);

  function handleWaveformClick(event: MouseEvent<HTMLDivElement>) {
    if (!activeTrack || !overlayRef.current) {
      return;
    }

    const rect = overlayRef.current.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const percent = (clickX / rect.width) * 100;

    if (!currentTrackOnPage) {
      playQueue(tracks, 0);
      window.setTimeout(() => {
        seekToPercent(percent);
      }, 120);
      return;
    }

    seekToPercent(percent);
  }

  if (!activeTrack) {
    return null;
  }

  return (
    <div className="waveform-card">
      <div className="waveform-topline">
        <div>
          <div className="waveform-title">
            {currentTrackOnPage
              ? activeTrack.title
              : lang === 'ru'
                ? 'Waveform релиза'
                : 'Release waveform'}
          </div>
          <div className="muted">
            {currentTrackOnPage
              ? lang === 'ru'
                ? 'Синхронизировано с нижним плеером'
                : 'Synced with the mini-player'
              : lang === 'ru'
                ? 'Нажми play или кликни по waveform, чтобы запустить релиз'
                : 'Press play or click the waveform to start the release'}
          </div>
        </div>
        <button
          type="button"
          className="play-button"
          onClick={() => {
            if (currentTrackOnPage) {
              togglePlayback();
              return;
            }

            playQueue(tracks, 0);
          }}
        >
          {currentTrackOnPage && isPlaying ? <Pause size={16} /> : <Play size={16} />}
          {currentTrackOnPage && isPlaying
            ? lang === 'ru'
              ? 'Пауза'
              : 'Pause'
            : 'Play'}
        </button>
      </div>

      <div
        ref={overlayRef}
        className={`waveform-shell${currentTrackOnPage ? ' is-interactive' : ''}`}
        onClick={handleWaveformClick}
        role="button"
        tabIndex={0}
      >
        <div ref={containerRef} />
      </div>

      <div className="waveform-time muted">
        <span>
          {Math.floor(currentTime / 60)}:{String(Math.floor(currentTime % 60)).padStart(2, '0')}
        </span>
        <span>
          {Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2, '0')}
        </span>
      </div>
    </div>
  );
}
