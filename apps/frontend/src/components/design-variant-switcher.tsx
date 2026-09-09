'use client';

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';

export const DESIGN_VARIANTS = [
  { id: 'signal', index: '00', name: 'Signal', note: 'generative archive' },
  { id: 'xerox', index: '01', name: 'Xerox', note: 'underground zine' },
  { id: 'acid', index: '02', name: 'Acid', note: 'rave transmission' },
  { id: 'chrome', index: '03', name: 'Chrome', note: 'liquid machine' },
  { id: 'grid', index: '04', name: 'Index', note: 'Swiss catalogue' },
  { id: 'nocturne', index: '05', name: 'Nocturne', note: 'cinematic afterdark' },
  { id: 'shelf', index: '06', name: 'Shelf', note: 'unfolding records' },
  { id: 'jewel', index: '07', name: 'Jewel', note: 'physical motion study' },
] as const;

export type DesignVariant = (typeof DESIGN_VARIANTS)[number]['id'];

const STORAGE_KEY = 'mityadima-design-variant';
const VARIANT_IDS = new Set<string>(DESIGN_VARIANTS.map((variant) => variant.id));

type DesignVariantContextValue = {
  variant: DesignVariant;
  ready: boolean;
  setVariant: (variant: DesignVariant) => void;
};

const DesignVariantContext = createContext<DesignVariantContextValue | null>(null);

function isDesignVariant(value: string | null): value is DesignVariant {
  return Boolean(value && VARIANT_IDS.has(value));
}

function applyVariant(variant: DesignVariant, persist = true) {
  const root = document.documentElement;
  const meta = DESIGN_VARIANTS.find((item) => item.id === variant) || DESIGN_VARIANTS[0];
  root.dataset.visualVariant = variant === 'jewel' ? 'shelf' : variant;
  root.style.setProperty('--variant-index', String(DESIGN_VARIANTS.indexOf(meta)));

  if (persist) {
    try {
      window.localStorage.setItem(STORAGE_KEY, variant);
      const url = new URL(window.location.href);
      if (variant === 'signal') url.searchParams.delete('skin');
      else url.searchParams.set('skin', variant);
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {
      // The visual switch still works if storage or History API is unavailable.
    }
  }

  window.dispatchEvent(new CustomEvent('mityadima:variant', { detail: variant }));
}

export function DesignVariantProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [variant, setVariantState] = useState<DesignVariant>('signal');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('skin');
    const fromDocument = document.documentElement.dataset.visualVariant || '';
    let fromStorage = '';
    try {
      fromStorage = window.localStorage.getItem(STORAGE_KEY) || '';
    } catch {
      // URL and the server-provided document state remain sufficient.
    }
    const active = isDesignVariant(fromUrl)
      ? fromUrl
      : isDesignVariant(fromDocument)
        ? fromDocument
        : isDesignVariant(fromStorage)
          ? fromStorage
          : 'signal';
    setVariantState(active);
    applyVariant(active, false);
    setReady(true);
  }, [pathname]);

  const value = useMemo<DesignVariantContextValue>(() => ({
    variant,
    ready,
    setVariant(nextVariant) {
      setVariantState(nextVariant);
      applyVariant(nextVariant);
    },
  }), [variant, ready]);

  return <DesignVariantContext.Provider value={value}>{children}</DesignVariantContext.Provider>;
}

export function useDesignVariant() {
  const context = useContext(DesignVariantContext);
  if (!context) {
    throw new Error('useDesignVariant must be used inside DesignVariantProvider');
  }
  return context;
}

export function DesignVariantSwitcher() {
  const { variant, setVariant } = useDesignVariant();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!event.altKey || !event.shiftKey) return;
      const index = Number(event.key);
      const next = DESIGN_VARIANTS[index];
      if (!next) return;
      event.preventDefault();
      setVariant(next.id);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setVariant]);

  const active = DESIGN_VARIANTS.find((item) => item.id === variant) || DESIGN_VARIANTS[0];

  return (
    <aside className={`design-lab${isOpen ? ' is-open' : ''}`} aria-label="Design variants">
      <button
        type="button"
        className="design-lab__toggle"
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
      >
        <span className="design-lab__pulse" aria-hidden="true" />
        <span>DESIGN</span>
        <strong>{active.index}</strong>
      </button>

      <div className="design-lab__panel">
        <div className="design-lab__heading">
          <span>VISUAL SYSTEMS</span>
          <button type="button" onClick={() => setIsOpen(false)} aria-label="Close design selector">×</button>
        </div>
        <div className="design-lab__options">
          {DESIGN_VARIANTS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="design-lab__option"
              aria-pressed={variant === item.id}
              onClick={() => {
                setVariant(item.id);
              }}
            >
              <span className="design-lab__swatch" data-swatch={item.id} aria-hidden="true" />
              <em>{item.index}</em>
              <strong>{item.name}</strong>
              <small>{item.note}</small>
            </button>
          ))}
        </div>
        <p>ALT + SHIFT + 0—7</p>
      </div>
    </aside>
  );
}
