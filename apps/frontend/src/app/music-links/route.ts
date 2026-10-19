import { getMusicSharePath } from '../../lib/music-share-catalog';

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id || id.length > 128) return Response.json({ error: 'Invalid release' }, { status: 400 });
  try { return Response.json({ path: await getMusicSharePath(id) }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return Response.json({ error: 'Link unavailable' }, { status: 503 }); }
}
