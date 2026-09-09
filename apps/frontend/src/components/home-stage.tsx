'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ArrowDownRight, Disc3, Radio, ScanLine, Sparkles } from 'lucide-react';
import { HomeRelease } from '../types';
import { SiteLang } from '../lib/language';
import { useDesignVariant } from './design-variant-switcher';
import { RecordShelfStage } from './paper-archive';
import { HomeLoading } from './home-loading';

type HomeStageProps = {
  lang: SiteLang;
  releases: HomeRelease[];
  shelfReleases?: HomeRelease[];
};

function SignalStage({ lang }: { lang: SiteLang }) {
  return (
    <section className="archive-intro home-stage home-stage--signal" aria-labelledby="archive-title">
      <div className="archive-intro__eyebrow">
        <span>MD / ARC—001</span>
        <span>{lang === 'ru' ? 'Красноярск · звуковой архив' : 'Krasnoyarsk · sonic archive'}</span>
        <span>56.0153° N</span>
      </div>
      <h1 id="archive-title" className="archive-intro__title">
        <span className="archive-intro__line archive-intro__line--mitya">MITYA</span>
        <span className="archive-intro__slash" aria-hidden="true">/</span>
        <span className="archive-intro__line archive-intro__line--dima">DIMA</span>
      </h1>
      <div className="archive-intro__footer">
        <p>{lang === 'ru' ? 'Винил · миксы · ночная частота' : 'Vinyl · mixes · nocturnal frequency'}</p>
        <svg viewBox="0 0 520 38" role="img" aria-label={lang === 'ru' ? 'Звуковая волна' : 'Sound wave'}>
          <path d="M0 19H72L79 7L87 31L96 12L104 26L113 3L122 35L132 17L159 19L170 10L180 29L191 4L201 35L212 14L223 23L234 8L245 31L257 19H520" />
        </svg>
        <p className="archive-intro__edition">{lang === 'ru' ? 'Живая коллекция / 2026' : 'Living collection / 2026'}</p>
      </div>
    </section>
  );
}

function XeroxStage({ lang, releases }: HomeStageProps) {
  const lead = releases[0];
  return (
    <section className="home-stage home-stage--xerox" aria-labelledby="xerox-title">
      <div className="xerox-stage__masthead">
        <span>ILLEGAL FREQUENCY</span><b>ISSUE № 001</b><span>KRASNOYARSK / 56°N</span>
      </div>
      <div className="xerox-stage__copy">
        <p>{lang === 'ru' ? 'Независимый звуковой листок' : 'Independent sound paper'}</p>
        <h1 id="xerox-title"><span>MIT</span><span>YA</span><i>/</i><span>DI</span><span>MA</span></h1>
        <blockquote>{lang === 'ru' ? 'Слушай громче. Архив не обязан быть тихим.' : 'Play it louder. An archive does not have to be quiet.'}</blockquote>
      </div>
      <Link className="xerox-stage__feature" href={lead ? `/releases/${lead.id}` : '/library'}>
        <div className="xerox-stage__tape">FEATURED / 001</div>
        <Image src="/art/xerox-hero.webp" alt="Photocopied underground sound collage" fill priority sizes="(max-width: 640px) 45vw, 38vw" />
        <span>{lead ? `${lead.artist} — ${lead.title}` : 'Open archive'}</span>
      </Link>
      <div className="xerox-stage__tear" aria-hidden="true">MUSIC / VINYL / NIGHT / BODY / MEMORY /</div>
      <Link className="xerox-stage__enter" href="/library">ENTER THE ARCHIVE <ArrowDownRight /></Link>
    </section>
  );
}

function AcidStage({ lang, releases }: HomeStageProps) {
  const lead = releases[1] || releases[0];
  return (
    <section className="home-stage home-stage--acid" aria-labelledby="acid-title">
      <div className="acid-stage__status"><Radio /> LIVE TRANSMISSION <b>56.0153 FM</b></div>
      <div className="acid-stage__dial" aria-hidden="true">
        <span>20</span><span>40</span><span>60</span><span>80</span><span>100</span>
      </div>
      <Link href={lead ? `/releases/${lead.id}` : '/library'} className="acid-stage__art">
        <Image src="/art/acid-hero.webp" alt="Surreal fluorescent dance floor and giant turntable" fill priority sizes="(max-width: 640px) 100vw, 58vw" />
        <span className="acid-stage__orbit">MITYA DIMA · MITYA DIMA · MITYA DIMA ·</span>
      </Link>
      <div className="acid-stage__type">
        <p>AFTER HOURS RADIO</p>
        <h1 id="acid-title">MOVE<br />YOUR<br /><em>BODY</em></h1>
        <div className="acid-stage__now"><span>NOW ROTATING</span><strong>{lead?.title || 'VINYL ARCHIVE'}</strong></div>
      </div>
      <Link className="acid-stage__button" href="/mixes"><Disc3 /> {lang === 'ru' ? 'МИКСЫ В ЭФИРЕ' : 'MIXES ON AIR'}</Link>
    </section>
  );
}

function ChromeStage({ lang, releases }: HomeStageProps) {
  const entries = releases.slice(0, 3);
  return (
    <section className="home-stage home-stage--chrome" aria-labelledby="chrome-title">
      <div className="chrome-stage__hud"><span>MD—OS / AUDIO ENVIRONMENT</span><span>CORE ONLINE</span></div>
      <h1 id="chrome-title" className="chrome-stage__title"><span>M</span><i>/</i><span>D</span></h1>
      <div className="chrome-stage__portal" aria-hidden="true"><span /><span /><span /></div>
      <div className="chrome-stage__art">
        <Image src="/art/chrome-hero.webp" alt="Floating liquid chrome sound sculpture" fill priority sizes="(max-width: 640px) 100vw, 82vw" />
      </div>
      <div className="chrome-stage__pods">
        {entries.map((release, index) => (
          <Link href={`/releases/${release.id}`} className={`chrome-stage__pod chrome-stage__pod--${index + 1}`} key={release.id}>
            <span>0{index + 1}</span><small>{release.title}</small>
          </Link>
        ))}
      </div>
      <div className="chrome-stage__copy">
        <ScanLine />
        <p>{lang === 'ru' ? 'Машина звуковой памяти' : 'A machine for sonic memory'}</p>
        <Link href="/library">INITIALIZE ARCHIVE <ArrowDownRight /></Link>
      </div>
    </section>
  );
}

function IndexStage({ lang, releases }: HomeStageProps) {
  return (
    <section className="home-stage home-stage--grid" aria-labelledby="grid-title">
      <header className="index-stage__header"><b>MD INDEX</b><span>CATALOGUE OF RECORDED MATTER</span><span>VOL. 04 / 2026</span></header>
      <div className="index-stage__title">
        <span>01—</span>
        <h1 id="grid-title">MITYA<br />DIMA</h1>
        <p>{lang === 'ru' ? 'Частная коллекция винила и ночных записей' : 'A private index of vinyl and nocturnal recordings'}</p>
      </div>
      <div className="index-stage__art">
        <Image src="/art/index-hero.webp" alt="Modernist archival photogram of vinyl materials" fill priority sizes="(max-width: 640px) 100vw, 50vw" />
        <span>ARCHIVE MATERIAL / PHOTOGRAM 04</span>
      </div>
      <div className="index-stage__footer"><span>{String(releases.length).padStart(3, '0')} LOADED</span><span>LIVE DATABASE</span><Link href="/library">VIEW COMPLETE INDEX →</Link></div>
    </section>
  );
}

function NocturneStage({ lang, releases }: HomeStageProps) {
  return (
    <section className="home-stage home-stage--nocturne" aria-labelledby="nocturne-title">
      <div className="nocturne-stage__issue"><span>LE NUMÉRO SONORE</span><span>№ 05</span></div>
      <figure className="nocturne-stage__portrait">
        <Image src="/art/nocturne-hero.webp" alt="Performer moving behind burgundy theatre curtains" fill priority sizes="(max-width: 640px) 70vw, 42vw" />
        <figcaption>Étude nocturne, Krasnoyarsk</figcaption>
      </figure>
      <div className="nocturne-stage__title">
        <p>{lang === 'ru' ? 'Музыка после наступления темноты' : 'Music after the onset of darkness'}</p>
        <h1 id="nocturne-title">Mitya<br /><em>Dima</em></h1>
        <blockquote>“{lang === 'ru' ? 'Каждая пластинка — сцена, каждый микс — движение.' : 'Every record is a scene, every mix is a movement.'}”</blockquote>
      </div>
      <div className="nocturne-stage__seal"><Sparkles /><span>SELECTED<br />FREQUENCIES</span></div>
      <Link className="nocturne-stage__read" href="/library">{lang === 'ru' ? 'Открыть коллекцию' : 'Read the collection'} <ArrowDownRight /></Link>
    </section>
  );
}

export function HomeStage(props: HomeStageProps) {
  const { variant, ready } = useDesignVariant();
  if (!ready) return <HomeLoading />;
  if (variant === 'xerox') return <XeroxStage {...props} />;
  if (variant === 'acid') return <AcidStage {...props} />;
  if (variant === 'chrome') return <ChromeStage {...props} />;
  if (variant === 'grid') return <IndexStage {...props} />;
  if (variant === 'nocturne') return <NocturneStage {...props} />;
  if (variant === 'shelf') return <RecordShelfStage lang={props.lang} releases={props.shelfReleases || props.releases} />;
  if (variant === 'jewel') return <RecordShelfStage lang={props.lang} releases={props.shelfReleases || props.releases} />;
  return <SignalStage lang={props.lang} />;
}
