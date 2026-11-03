export function positionStackHoverLabel(root: HTMLElement, cover: HTMLElement, label: HTMLElement) {
  const bounds = root.getBoundingClientRect();
  const sleeve = cover.getBoundingClientRect();
  // Use the projected bounds: perspective makes the sleeve wider than its CSS box.
  label.style.setProperty('--stack-hover-left', `${sleeve.right - bounds.left - root.clientLeft + 28}px`);
  label.style.setProperty('--stack-hover-top', `${sleeve.top - bounds.top - root.clientTop}px`);
}
