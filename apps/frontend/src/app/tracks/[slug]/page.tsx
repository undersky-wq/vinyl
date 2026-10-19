import { MusicPermalinkPage, permalinkMetadata } from '../../../components/music-permalink-page';
export const dynamic = 'force-dynamic';
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return permalinkMetadata((await params).slug, true);
}
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  return <MusicPermalinkPage slug={(await params).slug} original />;
}
