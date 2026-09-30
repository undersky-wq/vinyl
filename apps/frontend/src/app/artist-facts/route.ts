import { getArtistFact } from '../../lib/artist-facts';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const artist = new URL(request.url).searchParams.get('artist') || '';
  const fact = await getArtistFact(artist);
  return Response.json({ fact }, { headers: { 'Cache-Control': 'private, max-age=300' } });
}
