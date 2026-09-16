'use client';

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { updateAuthSettings } from '../lib/api';
import { SiteDesign } from '../types';

type DesignVariantContextValue = {
  variant: SiteDesign;
  setVariant: (variant: SiteDesign) => void;
};

const DesignVariantContext = createContext<DesignVariantContextValue | null>(null);

function applyVariant(variant: SiteDesign) {
  document.documentElement.dataset.visualVariant = variant;
}

export function DesignVariantProvider({ children, initialVariant }: { children: ReactNode; initialVariant: SiteDesign }) {
  const [variant, setVariantState] = useState<SiteDesign>(initialVariant);

  useEffect(() => {
    applyVariant(initialVariant);
    setVariantState(initialVariant);
  }, [initialVariant]);

  const value = useMemo<DesignVariantContextValue>(() => ({
    variant,
    setVariant(nextVariant) {
      setVariantState(nextVariant);
      applyVariant(nextVariant);
    },
  }), [variant]);

  return <DesignVariantContext.Provider value={value}>{children}</DesignVariantContext.Provider>;
}

export function useDesignVariant() {
  const context = useContext(DesignVariantContext);
  if (!context) throw new Error('useDesignVariant must be used inside DesignVariantProvider');
  return context;
}

export function DesignVariantSwitcher({ lang }: { lang: 'ru' | 'en' }) {
  const { variant, setVariant } = useDesignVariant();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  async function selectVariant(nextVariant: SiteDesign) {
    if (nextVariant === variant || isSaving) return;
    setIsSaving(true);
    setError('');
    try {
      const settings = await updateAuthSettings({ siteDesign: nextVariant });
      setVariant(settings.siteDesign);
      window.location.reload();
    } catch {
      setError(lang === 'ru' ? 'Не удалось сохранить дизайн.' : 'Failed to save design.');
      setIsSaving(false);
    }
  }

  return (
    <section className="profile-design-setting" aria-labelledby="profile-design-title">
      <div>
        <strong id="profile-design-title">{lang === 'ru' ? 'Дизайн сайта' : 'Site design'}</strong>
        <p className="muted">
          {lang === 'ru' ? 'Выбранный вариант применяется для всех посетителей.' : 'The selected design is used for every visitor.'}
        </p>
      </div>
      <div className="profile-design-setting__options">
        <button type="button" className={`profile-action-button profile-action-button--switch${variant === 'classic' ? ' active' : ''}`} aria-pressed={variant === 'classic'} disabled={isSaving} onClick={() => void selectVariant('classic')}>
          {lang === 'ru' ? 'Старый дизайн' : 'Classic'}
        </button>
        <button type="button" className={`profile-action-button profile-action-button--switch${variant === 'shelf' ? ' active' : ''}`} aria-pressed={variant === 'shelf'} disabled={isSaving} onClick={() => void selectVariant('shelf')}>
          Shelf
        </button>
      </div>
      {error ? <p className="muted" role="status">{error}</p> : null}
    </section>
  );
}
