export function getPinnedGenres(
  rows: Array<{ style: string; top: number; height: number }>,
  selected: string[], scrollTop: number, viewportHeight: number,
) {
  const top: string[] = [];
  const bottom: string[] = [];
  if (viewportHeight <= 0) return { top, bottom };
  for (const row of rows) {
    if (!selected.includes(row.style)) continue;
    if (row.top < scrollTop) top.push(row.style);
    else if (row.top + row.height > scrollTop + viewportHeight) bottom.push(row.style);
  }
  return { top, bottom };
}
