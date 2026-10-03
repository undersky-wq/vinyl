'use client';

import Link from 'next/link';
import { Instagram, Mail, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SiteLang } from '../lib/language';
import { useAuth } from '../providers/auth-provider';
import { LanguageSwitcher } from './language-switcher';
import { ShelfThemeToggle } from './shelf-theme-toggle';
import { useDesignVariant } from './design-variant-switcher';
import './about-page.css';
import './paper-sections.css';
import './record-archive.css';
import '../app/profile/profile-player.css';

const photos = ['/about/dmitry-01.webp', '/about/dmitry-02.webp', '/about/dmitry-03.webp'];

export function AboutPage({ lang }: { lang: SiteLang }) {
  const ru = lang === 'ru';
  const { user } = useAuth();
  const { variant } = useDesignVariant();
  const [photo, setPhoto] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [visible, setVisible] = useState(true);
  const [search, setSearch] = useState('');
  const [avatarFailed, setAvatarFailed] = useState(false);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => setReducedMotion(preference.matches);
    const updateVisibility = () => setVisible(!document.hidden);
    updateMotion();
    updateVisibility();
    preference.addEventListener('change', updateMotion);
    document.addEventListener('visibilitychange', updateVisibility);
    return () => {
      preference.removeEventListener('change', updateMotion);
      document.removeEventListener('visibilitychange', updateVisibility);
    };
  }, []);

  useEffect(() => {
    if (reducedMotion || !visible) return;
    const interval = window.setTimeout(() => setPhoto(value => (value + 1) % photos.length), 8500);
    return () => window.clearTimeout(interval);
  }, [photo, reducedMotion, visible]);

  return <main className="paper-section-page about-page">
    <header className="paper-page-header about-header">
      <div className="paper-page-identity">
        <Link href="/profile" className="paper-page-avatar" aria-label={ru ? 'Настройки профиля' : 'Profile settings'}>
          {user?.avatarStorageUrl && !avatarFailed ? <img src={user.avatarStorageUrl} alt="" onError={() => setAvatarFailed(true)} /> : <span>{user?.displayName?.slice(0, 1).toUpperCase() || '○'}</span>}
        </Link>
        <div className="paper-page-identity-text">
          <nav className="paper-page-brand-row" aria-label={ru ? 'Настройки страницы' : 'Page settings'}>
            <Link href="/">{ru ? 'Коллекция винила' : 'Vinyl collection'}</Link>
            {variant === 'shelf' && <ShelfThemeToggle compact iconOnly />}
            <LanguageSwitcher lang={lang} single />
          </nav>
          <form action="/" method="get" role="search">
            <input type="search" name="search" value={search} onChange={event => setSearch(event.target.value)}
              placeholder={ru ? 'Поиск' : 'Search'} aria-label={ru ? 'Поиск релизов и миксов' : 'Search releases and mixes'} />
          </form>
        </div>
      </div>
    </header>
    <section className="about-layout" aria-labelledby="about-title">
      <div className="about-gallery">
        <button type="button" className="about-photos" onClick={() => setPhoto(value => (value + 1) % photos.length)}
          aria-label={ru ? 'Показать следующую фотографию' : 'Show next photo'}>
          {photos.map((src, index) => <img key={src} src={src} width={1440} height={1440}
            alt={ru ? `Дмитрий за виниловыми проигрывателями — фото ${index + 1}` : `Dmitry playing vinyl — photo ${index + 1}`}
            className={photo === index ? 'is-active' : ''} aria-hidden={photo !== index} fetchPriority={index === 0 ? 'high' : 'auto'} />)}
        </button>
      </div>
      <div className="about-story">
        <p className="about-eyebrow">MITYA / DIMA</p>
        <h1 id="about-title">{ru ? 'Обо мне' : 'About me'}<span>.</span></h1>
        {ru ? <>
          <p>Меня зовут Дмитрий, я родом из России, город Красноярск.</p>
          <p>Виниловые пластинки коллекционирую с 2009 года. Люблю их слушать и играть в барах или на мероприятиях.</p>
        </> : <>
          <p>My name is Dmitry. I am from Krasnoyarsk, Russia.</p>
          <p>I have been collecting vinyl records since 2009. I love listening to them and playing them in bars and at events.</p>
        </>}
        <nav className="about-contacts" aria-label={ru ? 'Связаться со мной' : 'Contact me'}>
          <a href="https://www.instagram.com/mitya_dima/" target="_blank" rel="noopener noreferrer" aria-label="Instagram — mitya_dima" title="Instagram"><Instagram size={22} aria-hidden="true" /></a>
          <a href="https://t.me/Gerasimov1987" target="_blank" rel="noopener noreferrer" aria-label="Telegram — Gerasimov1987" title="Telegram"><Send size={22} aria-hidden="true" /></a>
          <a href="mailto:undersky@bk.ru" aria-label={ru ? 'Написать на undersky@bk.ru' : 'Email undersky@bk.ru'} title="undersky@bk.ru"><Mail size={22} aria-hidden="true" /></a>
        </nav>
      </div>
    </section>
  </main>;
}
