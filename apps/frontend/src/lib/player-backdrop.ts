export function isDesktopPlayerBackdrop(event: { target: EventTarget | null; currentTarget: EventTarget }, width: number) {
  return width > 700 && event.target === event.currentTarget;
}
