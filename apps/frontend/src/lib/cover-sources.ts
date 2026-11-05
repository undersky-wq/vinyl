export function coverResolutionMedia(displaySize: number) {
  // The small rendition is 320px. Let the browser choose the next size by DPR.
  return `(min-resolution:${(320 / Math.max(1, displaySize) + .001).toFixed(3)}dppx)`;
}

// Pick one quality tier for both mobile decks without coupling their geometry.
export function mobileDeckCoverSize(width: number, height: number) {
  return Math.max(180, Math.min(width * .62, height * .32));
}
