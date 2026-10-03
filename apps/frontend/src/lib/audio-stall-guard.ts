/** iOS can emit stalled while already buffered audio continues playing. */
export function isIOSWebKit(userAgent: string, platform: string, maxTouchPoints: number) {
  return /iPhone|iPad|iPod/.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
}

export function watchPersistentAudioStall(
  audio: HTMLAudioElement,
  recover: () => void,
  clock = {
    set: (callback: () => void, delay: number) => window.setTimeout(callback, delay),
    clear: (timer: number) => window.clearTimeout(timer),
    now: () => Date.now(),
  },
) {
  let timer: number | undefined;
  let lastRecovery = -Infinity;
  let observedTime = audio.currentTime;
  const cancel = () => {
    if (timer !== undefined) clock.clear(timer);
    timer = undefined;
  };
  const schedule = () => {
    if (timer !== undefined || audio.paused || audio.ended || audio.seeking) return;
    observedTime = audio.currentTime;
    const source = audio.src;
    timer = clock.set(() => {
      timer = undefined;
      if (audio.src !== source || audio.paused || audio.ended || audio.seeking
        || audio.readyState >= 3 || Math.abs(audio.currentTime - observedTime) > .1) return;
      if (clock.now() - lastRecovery < 30000) return;
      lastRecovery = clock.now();
      recover();
    }, 10000);
  };
  const onTimeUpdate = () => {
    if (Math.abs(audio.currentTime - observedTime) > .1) cancel();
  };
  audio.addEventListener('stalled', schedule);
  audio.addEventListener('waiting', schedule);
  audio.addEventListener('timeupdate', onTimeUpdate);
  const resetEvents = ['playing', 'pause', 'ended', 'emptied', 'seeking'] as const;
  resetEvents.forEach(event => audio.addEventListener(event, cancel));
  return () => {
    cancel();
    audio.removeEventListener('stalled', schedule);
    audio.removeEventListener('waiting', schedule);
    audio.removeEventListener('timeupdate', onTimeUpdate);
    resetEvents.forEach(event => audio.removeEventListener(event, cancel));
  };
}
