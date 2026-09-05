export const MARQUEE_START_DELAY_MS = 2500;
export const MARQUEE_END_PAUSE_MS = 1400;
export const MARQUEE_RETURN_MS = 650;
export const MARQUEE_RESTART_PAUSE_MS = 2200;

export function getMarqueeMotion(contentWidth: number, containerWidth: number, reduceMotion = false) {
  const valid = Number.isFinite(contentWidth) && Number.isFinite(containerWidth)
    && contentWidth > 0 && containerWidth > 0;
  const overflow = valid ? Math.max(0, contentWidth - containerWidth) : 0;
  const shouldScroll = !reduceMotion && overflow > 4;
  return {
    overflow,
    shouldScroll,
    durationMs: shouldScroll ? Math.min(12000, Math.max(3200, Math.round(overflow * 32))) : 0,
  };
}
