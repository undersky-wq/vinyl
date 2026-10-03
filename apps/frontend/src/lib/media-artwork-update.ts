type MetadataTrack = { id: string; title: string; artist: string; coverUrl: string };

export function getMediaMetadataKey(track: MetadataTrack) {
  return `${track.id}:${track.title}:${track.artist}:${track.coverUrl}`;
}

export function getMediaArtwork(coverUrl: string) {
  // Do not claim five different dimensions for the same image resource.
  return coverUrl ? [{ src: coverUrl }] : [];
}

/** Publish immediately; a slow image must never permanently clear artwork. */
export function startMediaArtworkUpdate(
  coverUrl: string,
  publish: () => void,
  load: (url: string) => Promise<boolean>,
  clock = {
    set: (callback: () => void, delay: number) => window.setTimeout(callback, delay),
    clear: (timer: number) => window.clearTimeout(timer),
  },
) {
  let cancelled = false;
  let timer: number | undefined;
  let attempts = 0;
  publish();
  const attempt = async () => {
    if (cancelled) return;
    attempts += 1;
    const ready = await load(coverUrl).catch(() => false);
    if (cancelled) return;
    publish();
    if (!ready && attempts < 3) timer = clock.set(() => void attempt(), attempts * 2000);
  };
  if (coverUrl) void attempt();
  return () => {
    cancelled = true;
    if (timer !== undefined) clock.clear(timer);
  };
}
