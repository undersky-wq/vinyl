import { getRelease } from '../../../../lib/api';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const release = await getRelease(id);
    const site = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://mityadima.ru';
    const full = new URL(request.url).searchParams.get('size') === 'full';
    let source = new URL((full ? release.coverStorageUrl || release.coverImageUrl : release.coverMediumStorageUrl) || release.coverStorageUrl || release.coverImageUrl || '/icon.png', site);
    // Only fetch known artwork origins, never an arbitrary URL from release metadata.
    const trusted = [new URL(site).hostname, 'mityadima.ru', 'www.mityadima.ru', 'i.discogs.com'];
    let response: Response | undefined;
    for (let hop = 0; hop < 3; hop++) {
      if (source.protocol !== 'https:' || (!trusted.includes(source.hostname) && !source.hostname.endsWith('.storage.selcloud.ru'))) return new Response(null, { status: 404 });
      response = await fetch(source, { redirect: 'manual', signal: AbortSignal.timeout(10000), cache: 'no-store' });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const destination = response.headers.get('location');
      if (!destination) return new Response(null, { status: 404 });
      source = new URL(destination, source);
    }
    if (!response) return new Response(null, { status: 404 });
    const type = response.headers.get('content-type')?.split(';')[0] || '';
    if (!response.ok || !['image/jpeg', 'image/png', 'image/webp'].includes(type) || Number(response.headers.get('content-length')) > 8 * 1024 * 1024) return new Response(null, { status: 404 });
    const image = await response.arrayBuffer();
    if (image.byteLength > 8 * 1024 * 1024) return new Response(null, { status: 404 });
    return new Response(image, { headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=3600, s-maxage=86400', 'X-Content-Type-Options': 'nosniff' } });
  } catch { return new Response(null, { status: 404 }); }
}
