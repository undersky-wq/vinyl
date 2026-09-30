'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { useDancerPreference } from '../lib/use-dancer-preference';
import { getHomeReleaseDetails } from '../lib/api';
import { usePlayerTransport } from '../providers/player-provider';
import styles from './techno-dancer.module.css';

const remarks = [
  'Ты че в меня тычешь? Трек лютый играет!',
  'Руки убрал, я на танцполе!',
  'Не сбивай, я только поймал грув.',
  'Тыкай в плей, а не в меня!',
  'Этот бас сам себя не протанцует.',
  'Погоди, сейчас дроп будет!',
  'Я не кнопка. Я техно-человек.',
  'Два тычка? Лучше два шага в бит!',
  'Не мешай, у меня свидание с бочкой.',
  'Все, поговорили. Теперь танцуем!',
  'Ты меня трогаешь, а трек трогает душу.',
  'Не тыкай, я считаю до четырех!',
  'Бочка зовет. Разговор окончен.',
  'У меня перерыв только между треками.',
  'Это не судороги. Это грув!',
  'Курсор убери, дай локтям свободу.',
  'Я тут за бас отвечаю. Не отвлекай.',
  'Слышишь хай-хэт? Вот и я слышу.',
  'Еще тычок, и ты танцуешь со мной.',
  'Ты пластинку выбирай, я разогрею танцпол.',
  'Маленький на экране, большой на рейве.',
  'Не тормози меня, тормози только винил.',
  'У этого трека побочный эффект: я.',
  'Я бы ответил, но пошла басовая линия.',
  'Плечи сами знают, что делать.',
  'Ты тоже головой качаешь. Я видел!',
  'В корзину не надо, я еще полезный!',
  'Меня нельзя перемотать. Можно только понять.',
  'Поставь погромче. Соседям тоже нужен грув.',
  'Пока ты кликаешь, я живу свою лучшую жизнь.',
  'Этот кик попал прямо в сердечко.',
  'Диджей, не выключай! Я только размялся.',
  'Что за трек? Ладно, потом посмотрю.',
  'Я не завис. Я прочувствовал момент.',
  'Танцпол маленький, планы большие.',
  'Не мешай, тут очень серьезный топот.',
  'До утра далеко. До следующей бочки близко.',
  'Ты мышкой, я ножками. Каждому свое.',
  'Я пришел за хлебом, но услышал техно.',
  'Все вопросы после сета, пожалуйста.',
];

const thoughts = [
  '«{track}»... лютый трек!',
  'Вот тут ваще кайф дроп.',
  'Щас бы водички попить.',
  'Фары запотели.',
  'Пласты тут мощные, конечно.',
  '«{track}» надо запомнить.',
  'Бочка прям как надо.',
  'Ноги устали. Ноги не согласны.',
  '«{track}» можно еще разок?',
  'Так, а где тут бар?',
  'Бас массажирует изнутри.',
  'Вот ради такого и пришел.',
  '«{track}» идет в личный топ.',
  'Сейчас бы дым-машину сюда.',
  'Кажется, я нашел свой грув.',
  'Опять мурашки под хай-хэт.',
  '«{track}» звучит как пятница.',
  'Надо было удобные кроссы надеть.',
  'Еще один трек и домой. Ага, конечно.',
  'Тут даже паузы качают.',
  '«{track}»... вот это находка.',
  'Кто-нибудь, сохраните этот момент.',
  'Мой пульс уже синхронизировался.',
  'Красиво завернули басовую линию.',
  'Под «{track}» время пропало.',
  'Этот танцпол мне по размеру.',
  'Уши довольны, колени в шоке.',
  'Все дела подождут до конца сета.',
  '«{track}» явно знает, что делает.',
  'Такой грув просто так не отпускает.',
];

export function TechnoDancer() {
  const [enabled, setEnabled] = useDancerPreference();
  const [dragging, setDragging] = useState(false);
  const [overTrash, setOverTrash] = useState(false);
  const trashRef = useRef<HTMLDivElement>(null);
  const { currentTrack, isPlaying } = usePlayerTransport();
  const releaseId = currentTrack?.releaseId;
  const [genres, setGenres] = useState<Record<string, boolean>>({});
  const [reducedMotion, setReducedMotion] = useState(true);
  const knownGenre = releaseId ? genres[releaseId] : undefined;
  const pathname = usePathname();
  const dancerRef = useRef<HTMLButtonElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const frameRef = useRef<HTMLCanvasElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const [remark, setRemark] = useState<string | null>(null);
  const [thought, setThought] = useState<string | null>(null);
  const lastThought = useRef(-1);
  const lastRemark = useRef(-1);
  const reactionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTap = useRef<{ time: number; x: number; y: number; type: string } | null>(null);
  const positionRef = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ id: number; dx: number; dy: number; x: number; y: number; time: number; moved: boolean } | null>(null);
  const visible = enabled && isPlaying && Boolean(knownGenre) && !reducedMotion;

  function isOverTrash(x: number, y: number) {
    const bounds = trashRef.current?.getBoundingClientRect();
    if (!bounds) return false;
    const inside = (px: number, py: number) => px >= bounds.left && px <= bounds.right && py >= bounds.top && py <= bounds.bottom;
    const dancer = dancerRef.current?.getBoundingClientRect();
    return inside(x, y) || Boolean(dancer && inside(dancer.left + dancer.width / 2, dancer.top + dancer.height / 2));
  }

  function placeBubble() {
    const dancer = dancerRef.current;
    const bubble = bubbleRef.current;
    if (!dancer || !bubble) return;
    const bounds = dancer.getBoundingClientRect();
    const head = bounds.left + bounds.width / 2;
    const left = Math.max(12, Math.min(head - bubble.offsetWidth / 2, window.innerWidth - bubble.offsetWidth - 12));
    const above = bounds.top >= bubble.offsetHeight + 24;
    bubble.style.left = `${left}px`;
    bubble.style.top = `${Math.max(12, Math.min(above ? bounds.top - bubble.offsetHeight - 16 : bounds.bottom + 16, window.innerHeight - bubble.offsetHeight - 12))}px`;
    bubble.style.setProperty('--tail-left', `${Math.max(18, Math.min(head - left, bubble.offsetWidth - 18))}px`);
    bubble.dataset.placement = above ? 'above' : 'below';
  }

  function reactToTap() {
    const image = imageRef.current;
    const canvas = frameRef.current;
    if (!image?.complete || !image.naturalWidth || !canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    // Animated WebP cannot be paused; show its current frame while it speaks.
    if (remark === null) {
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      context.drawImage(image, 0, 0);
    }
    const choices = remarks.map((_, index) => index).filter(index => index !== lastRemark.current);
    const index = choices[Math.floor(Math.random() * choices.length)];
    lastRemark.current = index;
    setThought(null);
    setRemark(remarks[index]);
    if (reactionTimer.current) clearTimeout(reactionTimer.current);
    reactionTimer.current = setTimeout(() => { setRemark(null); reactionTimer.current = null; }, 4200);
  }

  useEffect(() => {
    if (!visible) {
      setDragging(false);
      setOverTrash(false);
      setRemark(null);
      lastTap.current = null;
      if (reactionTimer.current) clearTimeout(reactionTimer.current);
      reactionTimer.current = null;
    }
    return () => { if (reactionTimer.current) clearTimeout(reactionTimer.current); };
  }, [visible]);

  useEffect(() => {
    setThought(null);
    if (!visible || dragging || remark !== null) return;
    let nextTimer: ReturnType<typeof setTimeout>;
    let hideTimer: ReturnType<typeof setTimeout>;
    const schedule = (delay: number) => {
      nextTimer = setTimeout(() => {
        if (document.hidden) { schedule(16000); return; }
        const choices = thoughts.map((_, index) => index).filter(index => index !== lastThought.current);
        const index = choices[Math.floor(Math.random() * choices.length)];
        lastThought.current = index;
        setThought(thoughts[index].replaceAll('{track}', currentTrack?.title.trim() || 'Этот трек'));
        hideTimer = setTimeout(() => {
          setThought(null);
          schedule(16000 + Math.random() * 12000);
        }, 6000);
      }, delay);
    };
    schedule(12000 + Math.random() * 8000);
    return () => { clearTimeout(nextTimer); clearTimeout(hideTimer); };
  }, [visible, dragging, remark, currentTrack?.id, currentTrack?.title]);

  useLayoutEffect(() => {
    if (!remark && !thought) return;
    placeBubble();
    const observer = new ResizeObserver(placeBubble);
    if (bubbleRef.current) observer.observe(bubbleRef.current);
    return () => observer.disconnect();
  }, [remark, thought]);

  function place(x: number, y: number) {
    const dancer = dancerRef.current;
    if (!dancer) return;
    const left = Math.max(0, Math.min(x, window.innerWidth - dancer.offsetWidth));
    const top = Math.max(0, Math.min(y, window.innerHeight - dancer.offsetHeight));
    dancer.style.left = `${left}px`;
    dancer.style.top = `${top}px`;
    placeBubble();
    return { x: left, y: top };
  }

  useLayoutEffect(() => {
    if (!visible) return;
    const player = document.querySelector('.mini-player');
    const updatePosition = () => {
      const dancer = dancerRef.current;
      if (!dancer) return;
      if (positionRef.current) {
        positionRef.current = place(positionRef.current.x, positionRef.current.y) ?? null;
        return;
      }
      const bounds = player?.getBoundingClientRect();
      place(
        (bounds ? bounds.left + bounds.width / 2 : window.innerWidth / 2) - dancer.offsetWidth / 2,
        (bounds?.top ?? window.innerHeight - 90) - dancer.offsetHeight - 8,
      );
    };
    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    if (player) observer.observe(player);
    if (dancerRef.current) observer.observe(dancerRef.current);
    window.addEventListener('resize', updatePosition);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updatePosition);
      dragRef.current = null;
    };
  }, [visible, pathname]);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!releaseId || !isPlaying || reducedMotion || knownGenre !== undefined) return;
    let cancelled = false;
    getHomeReleaseDetails(releaseId).then(release => {
      if (cancelled) return;
      const techno = release.styles.some(style => style.trim().toLowerCase() === 'techno');
      setGenres(previous => ({ ...previous, [releaseId]: techno }));
    }).catch(() => {
      // A failed metadata request must not interrupt playback or show the wrong dancer.
    });
    return () => { cancelled = true; };
  }, [releaseId, isPlaying, reducedMotion, knownGenre]);

  if (!visible) return null;

  return (
    <><button
      ref={dancerRef}
      type="button"
      className={styles.dancer}
      data-paused={remark !== null}
      aria-label="Танцующий персонаж: перетащи или нажми дважды для реплики"
      title="Перетащи меня или нажми дважды"
      onPointerDown={event => {
        if (event.button !== 0 || !event.isPrimary) return;
        event.preventDefault();
        event.stopPropagation();
        const bounds = event.currentTarget.getBoundingClientRect();
        dragRef.current = { id: event.pointerId, dx: event.clientX - bounds.left, dy: event.clientY - bounds.top, x: event.clientX, y: event.clientY, time: performance.now(), moved: false };
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.dataset.dragging = 'true';
      }}
      onPointerMove={event => {
        const drag = dragRef.current;
        if (!drag || drag.id !== event.pointerId) return;
        event.stopPropagation();
        if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 8) {
          drag.moved = true;
          lastTap.current = null;
        }
        if (!drag.moved) return;
        setDragging(true);
        positionRef.current = place(event.clientX - drag.dx, event.clientY - drag.dy) ?? null;
        setOverTrash(isOverTrash(event.clientX, event.clientY));
      }}
      onPointerUp={event => {
        const drag = dragRef.current;
        if (!drag || drag.id !== event.pointerId) return;
        event.stopPropagation();
        const discard = drag.moved && isOverTrash(event.clientX, event.clientY);
        setDragging(false);
        setOverTrash(false);
        if (discard) {
          positionRef.current = null;
          lastTap.current = null;
          setEnabled(false);
        }
        const now = performance.now();
        const isTap = !drag.moved && now - drag.time < 500 && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) <= 8;
        const previous = lastTap.current;
        if (isTap && previous && previous.type === event.pointerType && now - previous.time < 420 && Math.hypot(event.clientX - previous.x, event.clientY - previous.y) < 24) {
          lastTap.current = null;
          reactToTap();
        } else lastTap.current = isTap ? { time: now, x: event.clientX, y: event.clientY, type: event.pointerType } : null;
        dragRef.current = null;
        delete event.currentTarget.dataset.dragging;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={event => {
        setDragging(false);
        setOverTrash(false);
        dragRef.current = null;
        lastTap.current = null;
        delete event.currentTarget.dataset.dragging;
      }}
      onLostPointerCapture={event => {
        setDragging(false);
        setOverTrash(false);
        dragRef.current = null;
        delete event.currentTarget.dataset.dragging;
      }}
      onClick={event => event.stopPropagation()}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          if (!event.repeat) reactToTap();
          return;
        }
        const directions: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        const direction = directions[event.key];
        if (!direction) return;
        event.preventDefault();
        event.stopPropagation();
        const bounds = event.currentTarget.getBoundingClientRect();
        positionRef.current = place(bounds.left + direction[0] * 16, bounds.top + direction[1] * 16) ?? null;
      }}
    >
      {/* Preserve the original animated WebP. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={imageRef} src="/techno-dancer.webp" alt="" draggable={false} />
      <canvas ref={frameRef} className={styles.frozenFrame} aria-hidden="true" />
    </button>
    {(remark || thought) && <span ref={bubbleRef} key={remark || thought} className={`${styles.bubble}${remark ? '' : ` ${styles.thought}`}`} role={remark ? 'status' : undefined} aria-live={remark ? 'polite' : 'off'}>{remark || thought}</span>}
    {dragging && <div ref={trashRef} className={styles.trash} data-active={overTrash} aria-hidden="true">
      <Trash2 size={28} />
      <span>{overTrash ? 'Отпусти, чтобы убрать' : 'Убрать персонажа'}</span>
    </div>}</>
  );
}
