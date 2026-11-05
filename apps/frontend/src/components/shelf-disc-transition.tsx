'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import './shelf-disc-transition.css';

type DiscSnapshot = { disc: 1 | 2; flipped: boolean; children: ReactNode };
type DiscTransition = { current: DiscSnapshot; previous: DiscSnapshot | null; version: number };

const decodedCovers = new Set<string>();
const loadingCovers = new Map<string, Promise<boolean>>();
export function decodeCover(url: string) {
  if (!url || decodedCovers.has(url)) return Promise.resolve(true);
  const pending = loadingCovers.get(url);
  if (pending) return pending;
  const ready = new Promise<boolean>(resolve => {
    const image = new Image();
    let finished = false;
    const finish = (decoded = false) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      if (decoded) decodedCovers.add(url);
      resolve(decoded);
    };
    const timer = setTimeout(() => finish(), 4000);
    image.onload = () => {
      if (typeof image.decode !== 'function') { finish(true); return; }
      void image.decode().then(() => finish(true), () => finish());
    };
    image.onerror = () => finish();
    image.src = url;
  });
  loadingCovers.set(url, ready);
  void ready.then(() => loadingCovers.delete(url));
  return ready;
}

export function ShelfDiscTransition({ disc, flipped, sources, children }: DiscSnapshot & { sources: string[] }) {
  const desired = { disc, flipped, children };
  const [transition,setTransition] = useState<DiscTransition>(() => ({ current: desired, previous: null, version: 0 }));
  const committed = useRef(desired);
  const current = transition.current.disc === disc ? desired
    : committed.current.disc === transition.current.disc ? committed.current : transition.current;
  useLayoutEffect(() => { committed.current = current; });
  const sourcesKey = JSON.stringify([...new Set(sources.filter(Boolean))]);
  useEffect(() => {
    if (disc === transition.current.disc) return;
    let cancelled = false;
    void Promise.all((JSON.parse(sourcesKey) as string[]).map(decodeCover)).then(() => {
      if (cancelled) return;
      const previous = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? null : committed.current;
      setTransition(state => ({ current: desired, previous, version: state.version + 1 }));
    });
    return () => { cancelled = true; };
    // Only a new disc/URL starts loading; its latest side is rendered on commit.
  }, [disc, sourcesKey, transition.current.disc]);
  useEffect(() => {
    if (!transition.previous) return;
    const version = transition.version;
    const timer = setTimeout(() => setTransition(state => state.version === version ? {...state,previous:null} : state), 650);
    return () => clearTimeout(timer);
  }, [transition.version, transition.previous]);
  const reverse = transition.previous && transition.current.disc < transition.previous.disc;
  return <span className={`shelf-disc-transition${reverse ? ' is-reverse' : ''}`}>
    {transition.previous && <span key={`out-${transition.version}`} className="shelf-disc-layer is-outgoing" data-disc={transition.previous.disc} data-back={transition.previous.flipped} aria-hidden="true">{transition.previous.children}</span>}
    <span key={`disc-${transition.current.disc}`} className={`shelf-disc-layer${transition.previous ? ' is-entering' : ''}`} data-disc={current.disc} data-back={current.flipped} onAnimationEnd={event=>{
      if(event.target===event.currentTarget&&event.animationName==='shelf-disc-enter')setTransition(state=>state.version===transition.version?{...state,previous:null}:state);
    }}>{current.children}</span>
  </span>;
}
