export function frameMeasurement(measure: () => void) {
  let frame: number | null = null;
  return {
    schedule() {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => { frame = null; measure(); });
    },
    cancel() {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    },
  };
}

export function setLayoutProperties(element: HTMLElement, properties: Record<string, string>) {
  for (const [name, value] of Object.entries(properties)) {
    if (element.style.getPropertyValue(name) !== value) element.style.setProperty(name, value);
  }
}

export function observeCardHeights(cards: HTMLElement[], minimum: number, update: (heights: Record<string, number>) => void) {
  const initial: Record<string, number> = {};
  cards.forEach(card => { if (card.dataset.releaseId) initial[card.dataset.releaseId] = Math.max(minimum, card.offsetHeight); });
  update(initial);
  const observer = new ResizeObserver(entries => {
    const heights: Record<string, number> = {};
    for (const entry of entries) {
      const card = entry.target as HTMLElement;
      if (!card.dataset.releaseId) continue;
      // Border-box dimensions match offsetHeight without forcing another read.
      const box = entry.borderBoxSize?.[0];
      heights[card.dataset.releaseId] = Math.max(minimum, box ? Math.round(box.blockSize) : card.offsetHeight);
    }
    update(heights);
  });
  cards.forEach(card => observer.observe(card));
  return () => observer.disconnect();
}
