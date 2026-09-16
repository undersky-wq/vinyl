import { cookies } from 'next/headers';
import { MixesBrowser } from '../../components/mixes-browser';
import { Topbar } from '../../components/topbar';
import { RecordShelfStage } from '../../components/paper-archive';
import { getLibraryReleasesFeed, getSiteSettings } from '../../lib/api';
import { normalizeSiteLang } from '../../lib/language';
import { HomeRelease, Release } from '../../types';

const MIXES_PAGE_SIZE = 80;

function toShelfRelease(release: Release): HomeRelease {
  return {
    id: release.id,
    audioComplete: release.audioComplete,
    artist: release.artist,
    title: release.title,
    year: release.year,
    styles: release.styles,
    isMix: true,
    coverStorageUrl: release.coverStorageUrl,
    coverThumbStorageUrl: release.coverThumbStorageUrl,
    coverMediumStorageUrl: release.coverMediumStorageUrl,
    coverImageUrl: release.coverImageUrl,
    tracks: release.tracks.map(track => ({
      id: track.id,
      title: track.title,
      position: track.position,
      bpm: track.bpm,
      key: track.key,
      durationRaw: track.durationRaw,
      durationSec: track.durationSec,
      waveformData: track.waveformData,
      audioUrl: track.audioFiles.find(file => file.normalizedStorageUrl)?.normalizedStorageUrl
        || track.audioFiles.find(file => file.storageUrl)?.storageUrl
        || '',
    })),
  };
}

export default async function MixesPage() {
  const cookieStore = await cookies();
  const lang = normalizeSiteLang(cookieStore.get('site-lang')?.value);
  const cookieHeader = cookieStore.toString();
  const query = new URLSearchParams();
  query.set('limit', String(MIXES_PAGE_SIZE));
  query.set('offset', '0');
  query.set('isMix', 'true');

  const collectionQuery = new URLSearchParams({limit:'1',offset:'0',isMix:'false'});
  const [feed,collectionFeed] = await Promise.all([
    getLibraryReleasesFeed(query, cookieHeader),
    getLibraryReleasesFeed(collectionQuery, cookieHeader),
  ]);
  const siteSettings = await getSiteSettings().catch(() => ({ siteDesign: 'classic' as const }));
  if (siteSettings.siteDesign === 'shelf') return (
    <main className="page-shell page-shell--home paper-mixes-page">
      <RecordShelfStage lang={lang} releases={feed.releases.map(toShelfRelease)} mixesMode collectionCount={collectionFeed.collectionTotal ?? collectionFeed.total} mixCount={feed.collectionTotal ?? feed.total} />
    </main>
  );

  return <main className="page-shell"><Topbar lang={lang} active="mixes" /><MixesBrowser lang={lang} releases={feed.releases} /></main>;
}
