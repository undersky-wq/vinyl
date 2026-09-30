'use client';

import { RefObject, useLayoutEffect } from 'react';

// Animate the visible pieces from their previous positions, not from a generic
// entrance offset. The transport and audio state are deliberately untouched.
export function useMiniPlayerLayoutMotion(ref: RefObject<HTMLDivElement | null>, enabled: boolean) {
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root || !enabled) return;
    const parts = Array.from(root.querySelectorAll<HTMLElement>(
      '.mini-player__track,.mini-player__controls,.mini-player__timeline',
    ));
    const desktop = matchMedia('(min-width:701px)');
    const reduced = matchMedia('(prefers-reduced-motion:reduce)');
    let previous = parts.map(part => part.getBoundingClientRect());
    let animations: Animation[] = [];
    let frame = 0;
    const signature = () => {
      const archive = document.querySelector('.paper-archive');
      return `${!!archive}:${archive?.getAttribute('data-player-layout') ?? ''}`;
    };
    let layout = signature();
    const sample = () => {
      previous = parts.map(part => part.getBoundingClientRect());
      if (animations.some(animation => animation.playState === 'running')) {
        frame = requestAnimationFrame(sample);
      } else {
        animations.forEach(animation => animation.cancel());
        animations = [];
        frame = 0;
      }
    };
    const update = () => {
      const nextLayout = signature();
      if (nextLayout === layout) return;
      layout = nextLayout;
      const from = previous;
      cancelAnimationFrame(frame);
      animations.forEach(animation => animation.cancel());
      animations = [];
      const to = parts.map(part => part.getBoundingClientRect());
      if (desktop.matches && !reduced.matches) {
        animations = parts.map((part, index) => {
          // A centered grid item also shifts when its animated width changes.
          const centering = getComputedStyle(part).justifySelf === 'center'
            ? (from[index].width - to[index].width) / 2 : 0;
          return part.animate([
          {
            transform: `translate(${from[index].x - to[index].x + centering}px,${from[index].y - to[index].y}px)`,
            width: `${from[index].width}px`,
          },
          { transform: 'translate(0,0)', width: `${to[index].width}px` },
        ], { duration: 850, easing: 'cubic-bezier(.16,1,.3,1)' });
        });
        frame = requestAnimationFrame(sample);
      } else {
        previous = to;
      }
    };
    const observer = new MutationObserver(records => {
      if (records.some(record => record.type === 'childList'
        || (record.target instanceof Element && record.target.matches('.paper-archive')))) update();
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'data-player-layout'] });
    const reset = () => {
      cancelAnimationFrame(frame);
      animations.forEach(animation => animation.cancel());
      animations = [];
      previous = parts.map(part => part.getBoundingClientRect());
    };
    window.addEventListener('resize', reset);
    reduced.addEventListener('change', reset);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', reset);
      reduced.removeEventListener('change', reset);
      reset();
    };
  }, [ref, enabled]);
}
