export type RetriableResource = {
  load: (force?: boolean) => Promise<boolean>;
  hasLoaded: () => boolean;
  reset: () => void;
};

export function createRetriableResource<T>(
  request: () => Promise<T>,
  apply: (value: T) => void,
  retryDelayMs = 700,
): RetriableResource {
  let loaded = false;
  let inFlight: Promise<boolean> | null = null;
  let generation = 0;

  async function run(epoch: number) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const value = await request();
        if (epoch !== generation) return false;
        apply(value);
        loaded = true;
        return true;
      } catch {
        if (epoch !== generation) return false;
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
      const epoch = generation;
      inFlight = run(epoch).finally(() => { if (epoch === generation) inFlight = null; });
      return inFlight;
    },
    hasLoaded: () => loaded,
    reset() { generation += 1; loaded = false; inFlight = null; },
  };
}
