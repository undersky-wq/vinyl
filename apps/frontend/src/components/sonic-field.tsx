'use client';

import { useEffect, useRef } from 'react';
import { usePlayerActions, usePlayerProgress, usePlayerTransport } from '../providers/player-provider';

type AudioGraph = {
  context: AudioContext;
  analyser: AnalyserNode;
  data: Uint8Array<ArrayBuffer>;
};

const audioGraphs = new WeakMap<HTMLAudioElement, AudioGraph>();

function getAudioGraph(audio: HTMLAudioElement | null) {
  if (!audio?.currentSrc || typeof window === 'undefined') return null;

  try {
    const sourceUrl = new URL(audio.currentSrc, window.location.href);
    if (sourceUrl.origin !== window.location.origin) return null;
    const cached = audioGraphs.get(audio);
    if (cached) return cached;

    const AudioContextConstructor = window.AudioContext;
    if (!AudioContextConstructor) return null;

    const context = new AudioContextConstructor();
    const analyser = context.createAnalyser();
    const source = context.createMediaElementSource(audio);
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.84;
    source.connect(analyser);
    analyser.connect(context.destination);
    const graph = { context, analyser, data: new Uint8Array(analyser.frequencyBinCount) };
    audioGraphs.set(audio, graph);
    return graph;
  } catch {
    return null;
  }
}

export function SonicField() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { currentTrack, isPlaying } = usePlayerTransport();
  const { currentTime, duration } = usePlayerProgress();
  const { getAudioElement } = usePlayerActions();
  const audioGetterRef = useRef(getAudioElement);
  const stateRef = useRef({ currentTrack, isPlaying, currentTime, duration });

  useEffect(() => {
    stateRef.current = { currentTrack, isPlaying, currentTime, duration };
    audioGetterRef.current = getAudioElement;
  }, [currentTrack, currentTime, duration, getAudioElement, isPlaying]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const coarsePointer = window.matchMedia('(pointer: coarse)');
    const pointer = { x: window.innerWidth * 0.7, y: window.innerHeight * 0.35, vx: 0, vy: 0, px: 0, py: 0 };
    let width = 0;
    let height = 0;
    let frame = 0;
    let lastTime = performance.now();
    let lastKick = 0;

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, coarsePointer.matches ? 1.15 : 1.5);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.max(1, Math.floor(width * ratio));
      canvas.height = Math.max(1, Math.floor(height * ratio));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const move = (event: PointerEvent) => {
      pointer.vx = event.clientX - pointer.px;
      pointer.vy = event.clientY - pointer.py;
      pointer.px = event.clientX;
      pointer.py = event.clientY;
      pointer.x += (event.clientX - pointer.x) * 0.32;
      pointer.y += (event.clientY - pointer.y) * 0.32;
      document.documentElement.style.setProperty('--pointer-x', `${(event.clientX / Math.max(width, 1)) * 100}%`);
      document.documentElement.style.setProperty('--pointer-y', `${(event.clientY / Math.max(height, 1)) * 100}%`);
    };

    const getBands = (time: number) => {
      const playback = stateRef.current;
      const audio = audioGetterRef.current();
      const graph = playback.isPlaying ? getAudioGraph(audio) : null;
      if (graph) {
        if (graph.context.state === 'suspended') void graph.context.resume().catch(() => undefined);
        graph.analyser.getByteFrequencyData(graph.data);
        const average = (from: number, to: number) => {
          let sum = 0;
          for (let index = from; index < to; index += 1) sum += graph.data[index] || 0;
          return sum / Math.max(to - from, 1) / 255;
        };
        return [average(0, 10), average(10, 42), average(42, 96)];
      }

      const waveform = playback.currentTrack?.waveformData || [];
      const ratio = playback.duration > 0 ? playback.currentTime / playback.duration : (time * 0.00004) % 1;
      const point = waveform.length ? waveform[Math.floor(ratio * (waveform.length - 1))] || 0.22 : 0.22;
      const pulse = playback.isPlaying ? Math.max(0, Math.sin(time * 0.008)) : 0;
      return [point * (0.52 + pulse * 0.48), point * 0.56, point * 0.28];
    };

    const draw = (time: number) => {
      const delta = Math.min(32, time - lastTime);
      lastTime = time;
      const [bass, mid, high] = getBands(time);
      const active = stateRef.current.isPlaying;
      const signal = active ? Math.min(1, bass * 1.55 + mid * 0.35) : 0.12;
      lastKick += (signal - lastKick) * Math.min(1, delta * 0.009);
      document.documentElement.style.setProperty('--signal-level', lastKick.toFixed(3));

      context.clearRect(0, 0, width, height);
      context.save();
      const centerX = pointer.x + Math.sin(time * 0.00023) * width * 0.08;
      const centerY = pointer.y + Math.cos(time * 0.00019) * height * 0.08;
      const radius = Math.min(width, height) * (0.18 + lastKick * 0.12);
      const variant = document.documentElement.dataset.visualVariant || 'signal';

      if (variant === 'xerox') {
        context.globalCompositeOperation = 'source-over';
        const rows = coarsePointer.matches ? 7 : 12;
        for (let row = 0; row < rows; row += 1) {
          context.beginPath();
          const baseY = ((row + 0.55) / rows) * height;
          const points = coarsePointer.matches ? 28 : 64;
          for (let point = 0; point <= points; point += 1) {
            const x = (point / points) * width;
            const tear = Math.sin(point * 0.82 + row * 7.1 + time * 0.004) * (4 + bass * 30);
            const drag = Math.sin(x * 0.008 + time * 0.001 + row) * (6 + mid * 18);
            const y = baseY + tear + drag;
            if (point === 0) context.moveTo(x, y);
            else context.lineTo(x, y);
          }
          context.strokeStyle = `rgba(13,13,11,${0.035 + (row % 3) * 0.018 + lastKick * 0.05})`;
          context.lineWidth = row % 4 === 0 ? 5 : 1;
          context.stroke();
        }
        for (let mark = 0; mark < 28; mark += 1) {
          const x = (mark * 137.7 + time * 0.015) % (width + 60) - 30;
          const y = (mark * 71.3 + Math.sin(time * 0.0007 + mark) * 90) % height;
          context.fillStyle = `rgba(8,8,7,${0.025 + (mark % 5) * 0.008})`;
          context.fillRect(x, y, 2 + (mark % 9), 1 + (mark % 3));
        }
      } else if (variant === 'acid') {
        context.globalCompositeOperation = 'lighter';
        const originX = width * 0.52 + (centerX - width * 0.5) * 0.16;
        const originY = height * 0.42 + (centerY - height * 0.5) * 0.12;
        const colors = ['rgba(255,20,110,.24)', 'rgba(31,14,255,.2)', 'rgba(186,255,0,.2)'];
        for (let arm = 0; arm < 6; arm += 1) {
          context.beginPath();
          const points = coarsePointer.matches ? 64 : 120;
          for (let point = 0; point <= points; point += 1) {
            const progress = point / points;
            const angle = progress * Math.PI * (4.4 + mid * 2) + arm * (Math.PI / 3) + time * 0.00025;
            const spread = progress * Math.min(width, height) * (0.22 + lastKick * 0.1);
            const wobble = Math.sin(progress * 19 + time * 0.002 + arm) * (7 + high * 34);
            const x = originX + Math.cos(angle) * (spread + wobble);
            const y = originY + Math.sin(angle) * (spread * 0.64 + wobble);
            if (point === 0) context.moveTo(x, y);
            else context.lineTo(x, y);
          }
          context.strokeStyle = colors[arm % colors.length];
          context.lineWidth = 1 + (arm % 3) * 0.65;
          context.stroke();
        }
      } else if (variant === 'chrome') {
        context.globalCompositeOperation = 'screen';
        const glow = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius * 1.8);
        glow.addColorStop(0, `rgba(255,255,255,${0.04 + bass * 0.09})`);
        glow.addColorStop(0.35, `rgba(70,245,255,${0.025 + mid * 0.08})`);
        glow.addColorStop(0.68, `rgba(120,68,255,${0.02 + high * 0.06})`);
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        context.fillStyle = glow;
        context.fillRect(0, 0, width, height);
        for (let ring = 0; ring < 9; ring += 1) {
          const squash = 0.24 + ring * 0.045 + Math.sin(time * 0.0005 + ring) * 0.03;
          context.beginPath();
          context.ellipse(centerX, centerY, radius + ring * 34, (radius + ring * 34) * squash, time * 0.00008 + ring * 0.16, 0, Math.PI * 2);
          context.strokeStyle = ring % 3 === 0 ? `rgba(231,255,255,${0.06 + bass * 0.15})` : `rgba(130,151,255,${0.035 + mid * 0.09})`;
          context.lineWidth = ring % 4 === 0 ? 2 : 0.7;
          context.stroke();
        }
      } else if (variant === 'grid') {
        context.globalCompositeOperation = 'source-over';
        const unit = coarsePointer.matches ? 42 : 54;
        const offset = (time * (stateRef.current.isPlaying ? 0.015 + bass * 0.06 : 0.006)) % unit;
        context.strokeStyle = `rgba(10,35,82,${0.035 + mid * 0.04})`;
        context.lineWidth = 1;
        for (let x = -unit + offset; x < width + unit; x += unit) {
          context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke();
        }
        for (let y = -unit + offset; y < height + unit; y += unit) {
          context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke();
        }
        context.fillStyle = `rgba(236,41,37,${0.07 + bass * 0.14})`;
        const scanX = ((time * 0.035) % (width + 120)) - 60;
        context.fillRect(scanX, 0, 2 + lastKick * 8, height);
        context.fillRect(0, (centerY + time * 0.01) % height, width, 1);
      } else if (variant === 'nocturne') {
        context.globalCompositeOperation = 'lighter';
        const petals = coarsePointer.matches ? 5 : 9;
        for (let petal = 0; petal < petals; petal += 1) {
          const angle = (petal / petals) * Math.PI * 2 + time * 0.00008;
          const reach = radius * (1.2 + petal * 0.06 + bass * 0.3);
          context.beginPath();
          context.moveTo(centerX, centerY);
          context.bezierCurveTo(
            centerX + Math.cos(angle - 0.7) * reach,
            centerY + Math.sin(angle - 0.7) * reach * 0.6,
            centerX + Math.cos(angle + 0.7) * reach,
            centerY + Math.sin(angle + 0.7) * reach * 0.6,
            centerX,
            centerY,
          );
          context.strokeStyle = petal % 2 ? `rgba(255,146,119,${0.035 + mid * 0.09})` : `rgba(139,117,255,${0.035 + high * 0.08})`;
          context.lineWidth = 0.8 + (petal % 3) * 0.45;
          context.stroke();
        }
      } else {
        context.globalCompositeOperation = 'lighter';
        for (let ring = 0; ring < 3; ring += 1) {
          context.beginPath();
          const points = coarsePointer.matches ? 44 : 72;
          for (let point = 0; point <= points; point += 1) {
            const angle = (point / points) * Math.PI * 2;
            const interference = Math.sin(angle * (3 + ring) + time * (0.00035 + ring * 0.0001)) * (18 + mid * 42);
            const x = centerX + Math.cos(angle) * (radius + ring * 46 + interference);
            const y = centerY + Math.sin(angle) * (radius * 0.48 + ring * 20 + interference * 0.5);
            if (point === 0) context.moveTo(x, y);
            else context.lineTo(x, y);
          }
          context.closePath();
          context.strokeStyle = ring === 0 ? `rgba(217,255,82,${0.07 + bass * 0.16})` : ring === 1 ? `rgba(49,87,255,${0.05 + mid * 0.13})` : `rgba(255,77,0,${0.04 + high * 0.14})`;
          context.lineWidth = ring === 0 ? 1.5 : 1;
          context.stroke();
        }
        const particles = coarsePointer.matches ? 18 : 44;
        for (let index = 0; index < particles; index += 1) {
          const seed = index * 93.71;
          const speed = 0.00008 + (index % 7) * 0.000012;
          const x = (seed * 23 + time * speed * width + Math.sin(time * 0.0004 + index) * 80) % (width + 120) - 60;
          const y = (seed * 11 + Math.sin(time * speed * 8 + index) * height * 0.34 + height * 0.5) % (height + 80) - 40;
          const size = 0.8 + ((index * 7) % 5) * 0.45 + lastKick * (index % 4);
          context.fillStyle = index % 5 === 0 ? 'rgba(255,77,0,.28)' : 'rgba(217,255,82,.18)';
          context.fillRect(x, y, size, size);
        }
      }

      context.restore();
      pointer.vx *= 0.88;
      pointer.vy *= 0.88;
      if (!reducedMotion.matches) frame = window.requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('pointermove', move, { passive: true });
    draw(performance.now());

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', move);
    };
  }, []);

  return (
    <div className="sonic-field" aria-hidden="true">
      <canvas ref={canvasRef} />
      <svg className="sonic-field__grid" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <pattern id="signal-grid" width="8" height="8" patternUnits="userSpaceOnUse">
            <path d="M 8 0 L 0 0 0 8" fill="none" stroke="currentColor" strokeWidth="0.08" />
          </pattern>
          <filter id="signal-warp">
            <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="7" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.4" />
          </filter>
        </defs>
        <rect width="100" height="100" fill="url(#signal-grid)" filter="url(#signal-warp)" />
      </svg>
    </div>
  );
}
