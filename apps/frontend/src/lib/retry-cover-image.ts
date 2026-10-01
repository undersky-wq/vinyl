// One recovery request per mounted image; never retry a missing file forever.
export function retryCoverImage(image: HTMLImageElement): boolean {
  const failedUrl = image.currentSrc || image.src;
  if (image.dataset.coverRetryOriginal === failedUrl || image.dataset.coverRetryUrl === failedUrl) return false;
  let url: URL;
  try { url = new URL(failedUrl, window.location.href); }
  catch { return false; }
  const stable = /^\/api\/media\/[^/]+\/covers\//.test(url.pathname);
  const legacy = /^s3\.[a-z0-9-]+\.storage\.selcloud\.ru$/.test(url.hostname)
    && /^\/[^/]+\/covers\//.test(url.pathname);
  if (!stable && !legacy) return false;
  // Also recover old signed URLs held by an already-open player or playlist.
  if (legacy) url = new URL(`/api/media${url.pathname}`, window.location.origin);
  url.searchParams.set('retry', String(Date.now()));
  image.dataset.coverRetryOriginal = failedUrl;
  image.dataset.coverRetryUrl = url.href;
  // A picture's matching source otherwise keeps selecting the failed URL.
  const picture = image.parentElement?.tagName === 'PICTURE' ? image.parentElement : null;
  picture?.querySelectorAll('source').forEach(source => { source.srcset = url.href; });
  image.src = url.href;
  return true;
}
