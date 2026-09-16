'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SiteLang } from '../lib/language';

type HomeStyleFiltersProps = {
  lang: SiteLang;
  search: string;
  hasAudio: string;
  styles: string[];
  selectedStyles: string[];
};

const MAX_SELECTED_STYLES = 5;

function toggleValue(values: string[], nextValue: string) {
  return values.includes(nextValue)
    ? values.filter((value) => value !== nextValue)
    : [...values, nextValue];
}

function buildFilterHref(input: {
  search: string;
  hasAudio: string;
  styles: string[];
  nextStyles?: string[];
  nextHasAudio?: string;
}) {
  const params = new URLSearchParams();

  if (input.search) {
    params.set('search', input.search);
  }

  const resolvedHasAudio = input.nextHasAudio ?? input.hasAudio;
  if (resolvedHasAudio) {
    params.set('hasAudio', resolvedHasAudio);
  }

  const selectedStyles = [...new Set(input.nextStyles ?? input.styles)].sort();
  if (selectedStyles.length) {
    // One canonical parameter prevents a combinatorial collection of equivalent
    // URLs (`style=A&style=B`, `style=B&style=A`, duplicates, and so on).
    params.set('style', selectedStyles.join(','));
  }

  const query = params.toString();
  return query ? `/?${query}` : '/';
}

export function HomeStyleFilters({
  lang,
  search,
  hasAudio,
  styles,
  selectedStyles,
}: HomeStyleFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  // Keep the first client render identical to SSR; the effect below applies
  // the compact list immediately after hydration.
  const [isMobile, setIsMobile] = useState(false);
  const popularStyles = styles.slice(0, isMobile ? 4 : 11);
  const collapsedStyles = [...new Set(popularStyles)];
  const visibleStyles = isExpanded ? styles : [...new Set([...collapsedStyles, ...selectedStyles])];
  const canToggle = styles.length > visibleStyles.length || isExpanded;

  useEffect(() => {
    const media = window.matchMedia('(max-width: 720px)');
    const handleChange = () => setIsMobile(media.matches);

    handleChange();
    media.addEventListener('change', handleChange);

    return () => {
      media.removeEventListener('change', handleChange);
    };
  }, []);

  return (
    <section className={`filters filters--home${isExpanded ? ' expanded' : ''}`}>
      <Link
        prefetch={false}
        className={`chip${!selectedStyles.length && !hasAudio ? ' active' : ''}`}
        href={buildFilterHref({
          search,
          hasAudio,
          styles: selectedStyles,
          nextStyles: [],
          nextHasAudio: '',
        })}
      >
        {lang === 'ru' ? 'Все' : 'All'}
      </Link>

      {(!selectedStyles.length || isExpanded || hasAudio === 'true') ? (
        <Link
          prefetch={false}
          className={`chip${hasAudio === 'true' ? ' active' : ''}`}
          href={buildFilterHref({
            search,
            hasAudio,
            styles: selectedStyles,
            nextHasAudio: hasAudio === 'true' ? '' : 'true',
          })}
        >
          {lang === 'ru' ? 'Есть аудио' : 'Has audio'}
        </Link>
      ) : null}

      {visibleStyles.map((item) => {
        const isActive = selectedStyles.includes(item);
        const isAtLimit = selectedStyles.length >= MAX_SELECTED_STYLES && !isActive;
        const nextStyles = isAtLimit ? selectedStyles : toggleValue(selectedStyles, item);

        return (
          <Link
            prefetch={false}
            className={`chip${isActive ? ' active' : ''}`}
            aria-disabled={isAtLimit}
            title={isAtLimit ? (lang === 'ru' ? 'Можно выбрать не больше 5 жанров' : 'Choose up to 5 genres') : undefined}
            onClick={isAtLimit ? (event) => event.preventDefault() : undefined}
            href={buildFilterHref({
              search,
              hasAudio,
              styles: selectedStyles,
              nextStyles,
            })}
            key={`style-${item}`}
          >
            {item}
          </Link>
        );
      })}

      {canToggle ? (
        <button
          type="button"
          className="chip home-style-toggle"
          onClick={() => setIsExpanded((current) => !current)}
          aria-expanded={isExpanded}
        >
          ...
        </button>
      ) : null}
    </section>
  );
}
