'use client';

import { useEffect, useId, useRef } from 'react';
import './site-tooltips.css';

export function SiteTooltips() {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    const tip = ref.current;
    if (!tip) return;
    let owner: HTMLElement | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let touchUntil = 0;
    let anchorPosition: { left: number; top: number } | null = null;
    document.documentElement.dataset.siteTooltips = 'true';
    const hide = () => {
      clearTimeout(timer);
      if (tip.hidePopover && tip.matches(':popover-open')) tip.hidePopover();
      tip.hidden = true;
      if (owner) {
        const described = (owner.getAttribute('aria-describedby') || '').split(/\s+/).filter(value => value && value !== id).join(' ');
        if (described) owner.setAttribute('aria-describedby', described);
        else owner.removeAttribute('aria-describedby');
      }
      owner = null;
      anchorPosition = null;
    };
    const find = (target: EventTarget | null) => target instanceof Element ? target.closest<HTMLElement>('[data-site-tooltip],[data-tooltip]') : null;
    const show = (target: HTMLElement | null, keyboard = false) => {
      if (target === owner) return;
      hide();
      const text = target?.getAttribute('data-site-tooltip') || target?.getAttribute('data-tooltip');
      if (!target || !text) return;
      owner = target;
      const initialBox = target.getBoundingClientRect();
      anchorPosition = { left: initialBox.left, top: initialBox.top };
      timer = setTimeout(() => {
        if (!target.isConnected || owner !== target) return hide();
        const anchor = target.getBoundingClientRect();
        if (!anchor.width || !anchor.height) return hide();
        tip.textContent = text;
        tip.hidden = false;
        if (tip.showPopover) tip.showPopover();
        const box = tip.getBoundingClientRect();
        const viewport = window.visualViewport;
        const left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
        const width = viewport?.width || window.innerWidth, height = viewport?.height || window.innerHeight;
        tip.style.left = `${Math.max(left + 8, Math.min(anchor.left + anchor.width / 2 - box.width / 2, left + width - box.width - 8))}px`;
        const y = anchor.top - box.height - 8 >= top + 8 ? anchor.top - box.height - 8 : anchor.bottom + 8;
        tip.style.top = `${Math.max(top + 8, Math.min(y, top + height - box.height - 8))}px`;
        target.setAttribute('aria-describedby', [...new Set([...(target.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean), id])].join(' '));
      }, keyboard ? 0 : 180);
    };
    const over = (event: PointerEvent) => { if (event.pointerType !== 'touch' && !event.buttons) show(find(event.target)); };
    const out = (event: PointerEvent) => { if (owner && !(event.relatedTarget instanceof Node && owner.contains(event.relatedTarget))) hide(); };
    const focus = (event: FocusEvent) => { if (Date.now() >= touchUntil) show(find(event.target), true); };
    const blur = (event: FocusEvent) => { if (owner && !(event.relatedTarget instanceof Node && owner.contains(event.relatedTarget))) hide(); };
    const down = (event: PointerEvent) => { if (event.pointerType === 'touch') touchUntil = Date.now() + 800; hide(); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') hide(); };
    const scroll = () => {
      if (!owner || !anchorPosition) return;
      const box = owner.getBoundingClientRect();
      if (Math.abs(box.left - anchorPosition.left) > 1 || Math.abs(box.top - anchorPosition.top) > 1) hide();
    };
    document.addEventListener('pointerover', over);
    document.addEventListener('pointerout', out);
    document.addEventListener('focusin', focus);
    document.addEventListener('focusout', blur);
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('click', hide, true);
    document.addEventListener('keydown', key);
    document.addEventListener('scroll', scroll, true);
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('resize', hide);
    window.addEventListener('blur', hide);
    return () => {
      hide();
      delete document.documentElement.dataset.siteTooltips;
      document.removeEventListener('pointerover', over);
      document.removeEventListener('pointerout', out);
      document.removeEventListener('focusin', focus);
      document.removeEventListener('focusout', blur);
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('click', hide, true);
      document.removeEventListener('keydown', key);
      document.removeEventListener('scroll', scroll, true);
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('resize', hide);
      window.removeEventListener('blur', hide);
    };
  }, [id]);
  return <div ref={ref} id={id} role="tooltip" className="site-tooltip" popover="manual" hidden />;
}
