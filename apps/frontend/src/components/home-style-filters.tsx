'use client';

import Link from 'next/link';
import { useState } from 'react';
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
  const popularStyles = styles.slice(0, 6);
  const selectedHiddenStyles = selectedStyles.filter((style) => !popularStyles.includes(style));
  const collapsedStyles = [...new Set([...popularStyles, ...selectedHiddenStyles])];
  const visibleStyles = isExpanded ? styles : collapsedStyles;
  const canToggle = styles.length > collapsedStyles.length;

  return (
    <section className={`filters filters--home${isExpanded ? ' expanded' : ''}`}>
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
