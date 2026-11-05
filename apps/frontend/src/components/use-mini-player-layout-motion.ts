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
    let previousRoot = root.getBoundingClientRect();
    let wasAbout = Boolean(document.querySelector('.about-page'));
    let animations: Animation[] = [];
    let frame = 0;
    let layoutFrame = 0;
    const signature = () => {
      const archive = document.querySelector('.paper-archive');
      return `${!!archive}:${archive?.getAttribute('data-player-layout') ?? ''}:${!!document.querySelector('.about-page')}:${root.offsetWidth}:${root.offsetHeight}:${parts.map(part => `${part.offsetWidth},${part.offsetHeight}`).join(':')}`;
    };
    let layout = signature();
    const sample = () => {
      previous = parts.map(part => part.getBoundingClientRect());
      previousRoot = root.getBoundingClientRect();
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
      const fromRoot = previousRoot;
      const about = Boolean(document.querySelector('.about-page'));
      const aboutTransition = about || wasAbout;
      wasAbout = about;
      cancelAnimationFrame(frame);
      animations.forEach(animation => animation.cancel());
      animations = [];
      const to = parts.map(part => part.getBoundingClientRect());
      const toRoot = root.getBoundingClientRect();
      if ((desktop.matches || aboutTransition) && !reduced.matches
        && fromRoot.width > 0 && fromRoot.height > 0 && toRoot.width > 0 && toRoot.height > 0) {
        const scaleX = aboutTransition && toRoot.width ? fromRoot.width / toRoot.width : 1;
        const scaleY = aboutTransition && toRoot.height ? fromRoot.height / toRoot.height : 1;
        const frames = parts.map((part, index) => {
          const x = aboutTransition ? (from[index].x - fromRoot.x) / scaleX - (to[index].x - toRoot.x) : from[index].x - to[index].x;
          const y = aboutTransition ? (from[index].y - fromRoot.y) / scaleY - (to[index].y - toRoot.y) : from[index].y - to[index].y;
          // Compensate the parent scale when mapping each child's previous box.
          const sx = to[index].width ? from[index].width / to[index].width / scaleX : 1;
          const sy = to[index].height ? from[index].height / to[index].height / scaleY : 1;
          return [{transform:`translate(${x}px,${y}px) scale(${sx},${sy})`}, {transform:'none'}];
        });
        const timing = {duration:850,easing:'cubic-bezier(.16,1,.3,1)'};
        animations = parts.map((part, index) => part.animate(frames[index], timing));
        if (aboutTransition) {
          animations.push(root.animate([
            {transform:`translate(${fromRoot.x-toRoot.x}px,${fromRoot.y-toRoot.y}px) scale(${scaleX},${scaleY})`},
            {transform:'none'},
          ], timing));
        }
        frame = requestAnimationFrame(sample);
      } else {
        previous = to;
        previousRoot = toRoot;
      }
    };
    const schedule = () => {
      if (layoutFrame) return;
      layoutFrame = requestAnimationFrame(() => { layoutFrame = 0; update(); });
    };
    const observer = new MutationObserver(records => {
      const isPage = (node: Node) => node instanceof Element
        && (node.matches('.paper-archive,.about-page') || Boolean(node.querySelector('.paper-archive,.about-page')));
      if (records.some(record => record.type === 'childList'
        ? [...record.addedNodes, ...record.removedNodes].some(isPage)
        : record.target instanceof Element && (record.target.matches('.paper-archive,.about-page')
          || /\b(?:paper-archive|about-page)\b/.test(record.oldValue || '')))) schedule();
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeOldValue: true, attributeFilter: ['class', 'data-player-layout'] });
    // Route CSS can arrive after the DOM. Observe the final layout as well;
    // transform-only animations never resize these boxes or retrigger this.
    const resizeObserver = new ResizeObserver(schedule);
    [root, ...parts].forEach(part => resizeObserver.observe(part));
    const reset = () => {
      cancelAnimationFrame(frame);
      animations.forEach(animation => animation.cancel());
      animations = [];
      previous = parts.map(part => part.getBoundingClientRect());
      previousRoot = root.getBoundingClientRect();
      layout = signature();
    };
    window.addEventListener('resize', reset);
    reduced.addEventListener('change', reset);
    return () => {
      observer.disconnect();
      resizeObserver.disconnect();
      cancelAnimationFrame(layoutFrame);
      window.removeEventListener('resize', reset);
      reduced.removeEventListener('change', reset);
      reset();
    };
  }, [ref, enabled]);
}
