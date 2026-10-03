/** Warm only the next visible window; never fetch the complete collection. */
export function warmCoverImages(urls: string[], warmed: Set<string>) {
  const queue = [...new Set(urls)].filter(url => !warmed.has(url)).slice(0, 32);
  const active = new Map<HTMLImageElement, ReturnType<typeof setTimeout>>();
  let stopped = false;
  function next() {
    if (stopped) return;
    while (active.size < 2 && queue.length) {
      const url = queue.shift()!;
      const image = new Image();
      image.decoding = 'async';
      image.fetchPriority = 'low';
      const finish = (loaded: boolean) => {
        clearTimeout(active.get(image));
        active.delete(image);
        image.onload = image.onerror = null;
        if (loaded) {
          warmed.add(url);
          if (warmed.size > 128) warmed.delete(warmed.values().next().value!);
        }
        next();
      };
      active.set(image, setTimeout(() => finish(false), 10000));
      image.onload = () => finish(true);
      image.onerror = () => finish(false);
      image.src = url;
    }
  }
  next();
  return () => {
    stopped = true;
    for (const [image, timer] of active) {
      clearTimeout(timer);
      image.onload = image.onerror = null;
    }
    active.clear();
  };
}
