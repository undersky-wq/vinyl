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

  for (const style of input.nextStyles ?? input.styles) {
    params.append('style', style);
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
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 720px)').matches : false,
  );
  const popularStyles = styles.slice(0, isMobile ? 4 : 11);
  const collapsedStyles = [...new Set(popularStyles)];
  const isShowingSelectedOnly = !isExpanded && selectedStyles.length > 0;
  const visibleStyles = isExpanded ? styles : selectedStyles.length ? selectedStyles : collapsedStyles;
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
      {!isShowingSelectedOnly ? (
        <Link
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
      ) : null}

      {!isShowingSelectedOnly || hasAudio === 'true' ? (
        <Link
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
        const nextStyles = toggleValue(selectedStyles, item);
        const isActive = selectedStyles.includes(item);

        return (
          <Link
            className={`chip${isActive ? ' active' : ''}`}
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
