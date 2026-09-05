export type RetriableResource = {
  load: (force?: boolean) => Promise<boolean>;
  hasLoaded: () => boolean;
};

export function createRetriableResource<T>(
  request: () => Promise<T>,
  apply: (value: T) => void,
  retryDelayMs = 700,
): RetriableResource {
  let loaded = false;
  let inFlight: Promise<boolean> | null = null;

  async function run() {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const value = await request();
        apply(value);
        loaded = true;
        return true;
      } catch {
        if (attempt === 0) {
          if (retryDelayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
          } else {
            await Promise.resolve();
          }
        }
      }
    }
    return false;
  }

  return {
    load(force = false) {
      if (loaded && !force) return Promise.resolve(true);
      if (inFlight) return inFlight;
      inFlight = run().finally(() => { inFlight = null; });
      return inFlight;
    },
    hasLoaded: () => loaded,
  };
}
