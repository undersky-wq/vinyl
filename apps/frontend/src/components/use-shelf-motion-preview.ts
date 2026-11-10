'use client';

import { useEffect,useRef,type RefObject } from 'react';
import './shelf-motion-preview.css';
import type {ShelfDesignSettings} from '../lib/shelf-design-settings';

type Sleeve = {
  button: HTMLButtonElement; surface: HTMLElement; phase: number;
  hoverX: number; hoverY: number; x: number; y: number;
  spinX: number; spinY: number; velocityX: number; velocityY: number; released: number;
  visible: boolean;
  squared: boolean;
  floatBlend: number;
};
type Grip = { sleeve: Sleeve; pointer: number; startX: number; startY: number; lastX: number; lastY: number; lastTime: number; pitch: number; yaw: number; targetPitch: number; targetYaw: number; moved: boolean };
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const turn = (n: number) => ((n + 180) % 360 + 360) % 360 - 180;

// React owns the collection; this loop owns only the
// extra inner surface. Existing layout, scrolling and release clicks stay intact.
export function useShelfMotionPreview(rootRef: RefObject<HTMLElement | null>, enabled: boolean,settings:ShelfDesignSettings) {
  const settingsRef=useRef(settings);settingsRef.current=settings;
  useEffect(()=>{window.dispatchEvent(new Event('shelf-motion-wake'));},[settings]);
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !enabled) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const sleeves = new Map<HTMLButtonElement, Sleeve>();
    let hovered: Sleeve | null = null, grip: Grip | null = null;
    let blocked: HTMLButtonElement | null = null, blockUntil = 0;
    let frame = 0, previous = 0, clock = 0;
    let waveMix=settings.waveEnabled?1:0;
    root.classList.add('has-shelf-motion-preview');
    const visibilityObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const sleeve = sleeves.get(entry.target as HTMLButtonElement);
        if (sleeve) { sleeve.visible = entry.isIntersecting; sleeve.surface.style.willChange = entry.isIntersecting ? 'transform' : 'auto'; }
      }
      root.dataset.shelfAnimated = String([...sleeves.values()].filter(sleeve => sleeve.visible).length);
      wake();
    }, { root, rootMargin: '220px' });

    function refresh() {
      for (const [button] of sleeves) if (!root!.contains(button)) { visibilityObserver.unobserve(button); sleeves.delete(button); }
      root!.querySelectorAll<HTMLButtonElement>('.paper-record-open').forEach(button => {
        const surface = button.querySelector<HTMLElement>('.shelf-motion-surface');
        if (!surface) return;
        const index = Number(button.parentElement?.dataset.index || 0);
        const old = sleeves.get(button);
        if (old) { old.surface = surface; old.phase=index*.42; return; }
        sleeves.set(button, { button, surface, phase: index * .42, hoverX: 0, hoverY: 0, x: 0, y: 0, spinX: 0, spinY: 0, velocityX: 0, velocityY: 0, released: 0, visible: false, squared: false, floatBlend: 1 });
        visibilityObserver.observe(button);
      });
      wake();
    }
    function wake() { if (!frame && !document.hidden) frame = requestAnimationFrame(draw); }
    function draw(now: number) {
      frame = 0;
      if (document.hidden) { previous = 0; return; }
      if(root!.classList.contains('is-shuffling')){previous=0;return;}
      const elapsed = previous ? Math.min(48, now - previous) : 16.667;
      previous = now; clock += elapsed;
      const dt = elapsed / 16.667, ease = reduced.matches ? 1 : 1 - Math.pow(.84, dt);
      const scrolling = root!.classList.contains('is-scrolling');
      const deck = root!.dataset.layout === 'shelf' || root!.dataset.layout === 'stack';
      const waveTarget=deck&&settingsRef.current.waveEnabled?1:0;
      waveMix+=(waveTarget-waveMix)*ease;if(Math.abs(waveMix-waveTarget)<.0005)waveMix=waveTarget;
      let settling=false;
      for (const sleeve of sleeves.values()) {
        const held = grip?.sleeve === sleeve;
        // Expanded Grid covers use position:fixed and can be clipped by the
        // observer root. Direct pointer interaction still proves they are on
        // screen, even before their first rotation.
        const returning = sleeve.squared || turn(sleeve.spinX) !== 0 || turn(sleeve.spinY) !== 0 || sleeve.x !== 0 || sleeve.y !== 0;
        if (!sleeve.visible && !held && sleeve !== hovered && !returning) { sleeve.x = sleeve.y = 0; continue; }
        const targetX=sleeve === hovered && !scrolling ? sleeve.hoverX : 0,targetY=sleeve === hovered && !scrolling ? sleeve.hoverY : 0;
        sleeve.x += (targetX - sleeve.x) * ease;
        sleeve.y += (targetY - sleeve.y) * ease;
        if(Math.abs(sleeve.x-targetX)<.0005)sleeve.x=targetX;
        if(Math.abs(sleeve.y-targetY)<.0005)sleeve.y=targetY;
        if (held && grip) {
          const follow = reduced.matches ? 1 : 1 - Math.pow(.72, dt);
          sleeve.spinX += (grip.targetPitch - sleeve.spinX) * follow;
          sleeve.spinY += (grip.targetYaw - sleeve.spinY) * follow;
        } else {
          if (now - sleeve.released < 220 && !reduced.matches) {
            sleeve.spinX += sleeve.velocityX * dt; sleeve.spinY += sleeve.velocityY * dt;
            sleeve.velocityX *= Math.pow(.86, dt); sleeve.velocityY *= Math.pow(.86, dt);
          } else {
            const settle = reduced.matches ? 1 : 1 - Math.pow(.92, dt);
            sleeve.spinX += turn(-sleeve.spinX) * settle;
            sleeve.spinY += turn(-sleeve.spinY) * settle;
          }
        }
        if (sleeve.squared && !held && now-sleeve.released>650 && Math.abs(turn(sleeve.spinX))+Math.abs(turn(sleeve.spinY))<2) unsquare(sleeve);
        if(!held&&now-sleeve.released>=220){if(Math.abs(turn(sleeve.spinX))<.01)sleeve.spinX=Math.round(sleeve.spinX/360)*360;if(Math.abs(turn(sleeve.spinY))<.01)sleeve.spinY=Math.round(sleeve.spinY/360)*360;}
        if(sleeve.x!==targetX||sleeve.y!==targetY||turn(sleeve.spinX)!==0||turn(sleeve.spinY)!==0||sleeve.squared)settling=true;
        const floatTarget = held && grip?.moved ? 0 : 1;
        sleeve.floatBlend += (floatTarget - sleeve.floatBlend) * ease;
        if (Math.abs(sleeve.floatBlend-floatTarget)<.0005) sleeve.floatBlend=floatTarget;
        if (sleeve.floatBlend!==floatTarget) settling=true;
        const drift = reduced.matches ? 0 : waveMix * sleeve.floatBlend;
        // One travelling wave: adjacent records share a small phase delay.
        const wave = clock * .00145 - sleeve.phase;
        const floatX = Math.cos(wave) * 1.8 * drift;
        const floatY = (Math.sin(wave) * 6 + Math.sin(wave * 1.63) * 1.2) * drift;
        const pitch = sleeve.spinX - sleeve.y * 11 + Math.sin(wave-.3) * 1.1 * drift;
        const yaw = sleeve.spinY + sleeve.x * 15 + Math.cos(wave) * 1.5 * drift;
        const roll = Math.sin(wave+.4) * .65 * drift;
        sleeve.surface.style.transform = `translate3d(${floatX}px,${floatY}px,0) perspective(1000px) rotateX(${pitch}deg) rotateY(${yaw}deg) rotateZ(${roll}deg)`;
      }
      if ((deck&&settingsRef.current.waveEnabled&&!reduced.matches)||grip||settling||waveMix!==waveTarget) wake();
    }
    function find(target: EventTarget | null) {
      const button = target instanceof Element ? target.closest<HTMLButtonElement>('.paper-record-open') : null;
      if(button&&!sleeves.has(button)&&root!.contains(button))refresh();
      return button ? sleeves.get(button) : undefined;
    }
    function square(sleeve: Sleeve) {
      if (sleeve.squared) return;
      const record = sleeve.button.parentElement!;
      const style = getComputedStyle(record), matrix = new DOMMatrix(style.transform === 'none' ? undefined : style.transform);
      const origin = style.transformOrigin.split(' ').map(Number.parseFloat);
      const cx=record.offsetWidth/2,cy=record.offsetHeight/2;
      const projected = new DOMPoint(cx-origin[0],cy-origin[1]).matrixTransform(matrix);
      const corners=[[0,0],[record.offsetWidth,0],[0,record.offsetHeight],[record.offsetWidth,record.offsetHeight]]
        .map(([x,y])=>new DOMPoint(x-origin[0],y-origin[1]).matrixTransform(matrix));
      const xs=corners.map(point=>point.x/point.w),ys=corners.map(point=>point.y/point.w);
      // Preserve the average projected extent, rather than stretching a square
      // to the sheared deck's full height. Limit the compensation to 10%.
      const scale=Math.min(1.1,Math.max(1,((Math.max(...xs)-Math.min(...xs))+(Math.max(...ys)-Math.min(...ys)))/(record.offsetWidth+record.offsetHeight)));
      record.style.setProperty('--sleeve-grab-scale',String(scale));
      // Keep the same origin throughout the transition. Switching a centered
      // Stack cover to 0 0 would move its very first frame before interpolation.
      record.style.setProperty('--sleeve-grab-origin',style.transformOrigin);
      record.style.setProperty('--sleeve-grab-x',`${projected.x/projected.w-(cx-origin[0])*scale}px`);
      record.style.setProperty('--sleeve-grab-y',`${projected.y/projected.w-(cy-origin[1])*scale}px`);
      record.classList.add('is-sleeve-squared'); sleeve.squared = true;
    }
    function unsquare(sleeve: Sleeve) {
      sleeve.button.parentElement?.classList.remove('is-sleeve-squared'); sleeve.squared = false;
    }
    function move(event: PointerEvent) {
      if (event.pointerType === 'touch') return;
      if (grip && event.pointerId === grip.pointer) {
        const dx = event.clientX - grip.startX, dy = event.clientY - grip.startY;
        if (!grip.moved && Math.hypot(dx, dy) < 5) return;
        grip.moved = true; square(grip.sleeve); event.preventDefault(); event.stopImmediatePropagation();
        const dt = Math.max(8, event.timeStamp - grip.lastTime);
        grip.targetYaw = grip.yaw + dx * .85;
        grip.targetPitch = grip.pitch - dy * .7;
        grip.sleeve.velocityY = clamp((event.clientX - grip.lastX) * .85 * 16.667 / dt, -14, 14);
        grip.sleeve.velocityX = clamp(-(event.clientY - grip.lastY) * .7 * 16.667 / dt, -14, 14);
        grip.lastX = event.clientX; grip.lastY = event.clientY; grip.lastTime = event.timeStamp;
        wake(); return;
      }
      const sleeve = find(event.target);
      hovered = sleeve || null;
      if (sleeve && !reduced.matches) {
        const box = sleeve.button.getBoundingClientRect();
        sleeve.hoverX = clamp((event.clientX - box.left) / Math.max(1, box.width) * 2 - 1, -1, 1);
        sleeve.hoverY = clamp((event.clientY - box.top) / Math.max(1, box.height) * 2 - 1, -1, 1);
      }
      wake();
    }
    function down(event: PointerEvent) {
      root!.dataset.sleevePointer=`${event.pointerType}:${event.button}`;
      root!.dataset.sleevePointerTarget=event.target instanceof Element?`${event.target.tagName}.${event.target.className}`:'';
      if(!settingsRef.current.spinEnabled)return;
      if (event.pointerType === 'touch' || event.button !== 0) return;
      const sleeve = find(event.target);
      if (!sleeve) return;
      event.stopImmediatePropagation();
      grip = { sleeve, pointer: event.pointerId, startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY, lastTime: event.timeStamp, pitch: sleeve.spinX, yaw: sleeve.spinY, targetPitch: sleeve.spinX, targetYaw: sleeve.spinY, moved: false };
      root!.dataset.sleeveLastGrip=sleeve.button.getAttribute('aria-label')||'';
      sleeve.velocityX = sleeve.velocityY = 0;
      sleeve.button.setPointerCapture(event.pointerId);
      sleeve.button.classList.add('is-sleeve-gripped');
      root!.classList.add('is-sleeve-spinning');
      wake();
    }
    function up(event: PointerEvent) {
      if (!grip || event.pointerId !== grip.pointer) return;
      const { sleeve, moved } = grip;
      root!.dataset.sleeveLastGesture=moved?'rotate':'click';
      root!.dataset.sleeveLastTurn=`${sleeve.spinX.toFixed(1)},${sleeve.spinY.toFixed(1)}`;
      if (moved) { blocked = sleeve.button; blockUntil = performance.now() + 700; event.preventDefault(); event.stopImmediatePropagation(); }
      // Releasing the mouse after pausing should not throw the sleeve.
      if (event.timeStamp - grip.lastTime > 80 || event.type === 'pointercancel') sleeve.velocityX = sleeve.velocityY = 0;
      sleeve.released = performance.now();
      grip = null; hovered = null;
      sleeve.button.classList.remove('is-sleeve-gripped');
      root!.classList.remove('is-sleeve-spinning');
      if (sleeve.button.hasPointerCapture(event.pointerId)) sleeve.button.releasePointerCapture(event.pointerId);
      wake();
    }
    function click(event: MouseEvent) {
      if (blocked && performance.now() < blockUntil && find(event.target)?.button === blocked) {
        event.preventDefault(); event.stopImmediatePropagation(); blocked = null;
        return;
      }
      const sleeve=find(event.target); if(sleeve?.squared)unsquare(sleeve);
    }
    function leave() { if (!grip) hovered = null; wake(); }
    function blur() {
      if (!grip) return;
      const { sleeve, pointer } = grip;
      grip = null; hovered = null;
      sleeve.velocityX = sleeve.velocityY = 0; sleeve.released = 0;
      sleeve.button.classList.remove('is-sleeve-gripped');
      root!.classList.remove('is-sleeve-spinning');
      if (sleeve.button.hasPointerCapture(pointer)) sleeve.button.releasePointerCapture(pointer);
      wake();
    }
    function drag(event: DragEvent) { if (find(event.target)) event.preventDefault(); }
    function visibility() { previous = 0; if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else wake(); }
    const observer = new MutationObserver(refresh);
    observer.observe(root, { childList: true, subtree: true, attributes:true,attributeFilter:['data-layout'] });
    const stateObserver=new MutationObserver(wake);
    stateObserver.observe(root,{attributes:true,attributeFilter:['class']});
    window.addEventListener('pointerdown', down, true);
    root.addEventListener('pointerleave', leave);
    root.addEventListener('lostpointercapture', up, true);
    root.addEventListener('click', click, true);
    root.addEventListener('dragstart', drag);
    window.addEventListener('pointermove', move, { capture: true, passive: false });
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    window.addEventListener('blur', blur);
    window.addEventListener('shelf-motion-wake',wake);
    document.addEventListener('visibilitychange', visibility);
    reduced.addEventListener('change', wake);
    refresh();
    return () => {
      observer.disconnect();stateObserver.disconnect();visibilityObserver.disconnect(); cancelAnimationFrame(frame);
      delete root.dataset.shelfAnimated;
      window.removeEventListener('pointerdown', down, true);
      root.removeEventListener('pointerleave', leave);
      root.removeEventListener('lostpointercapture', up, true);
      root.removeEventListener('click', click, true);
      root.removeEventListener('dragstart', drag);
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      window.removeEventListener('blur', blur);
      window.removeEventListener('shelf-motion-wake',wake);
      document.removeEventListener('visibilitychange', visibility);
      reduced.removeEventListener('change', wake);
      root.classList.remove('has-shelf-motion-preview', 'is-sleeve-spinning');
      if (grip?.sleeve.button.hasPointerCapture(grip.pointer)) grip.sleeve.button.releasePointerCapture(grip.pointer);
      for (const sleeve of sleeves.values()) { const {button,surface}=sleeve; unsquare(sleeve); surface.style.transform = ''; surface.style.willChange = ''; button.classList.remove('is-sleeve-gripped'); }
    };
  }, [rootRef, enabled]);
}
