export function coverResolutionMedia(displaySize: number) {
  // The small rendition is 320px. Let the browser choose the next size by DPR.
  return `(min-resolution:${(320 / Math.max(1, displaySize) + .001).toFixed(3)}dppx)`;
}
