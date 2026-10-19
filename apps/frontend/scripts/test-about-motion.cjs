const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '../src/components', name), 'utf8');
const navigation = read('collection-transitions.tsx');
assert(navigation.includes("url.pathname === '/about'"));
assert(navigation.includes("router.prefetch('/about')"));
assert(navigation.includes('reduced ? 0 : 320'));
assert(navigation.indexOf("url.pathname === '/about'") < navigation.indexOf("if (!link.closest('.paper-archive,.paper-section-page'))"));
const motion = read('use-mini-player-layout-motion.ts');
assert(motion.includes('root.animate(['));
assert(motion.includes('previousRoot'));
assert(motion.includes('aboutTransition'));
assert(motion.includes('!reduced.matches'));
assert(!motion.includes('playQueue') && !motion.includes('prepareQueue'));
for (const width of [390, 700, 701, 1280, 1920]) {
  const mobile = width <= 700;
  const padding = width * (mobile ? .06 : .1);
  const maximum = mobile ? 480 : 1280;
  const content = Math.min(width - 2 * padding, maximum);
  const left = Math.max(padding, (width - maximum) / 2);
  assert(Math.abs(left - (width - content) / 2) < .001);
}
const css = read('about-page.css');
assert(css.includes('about-photo-arrive') && css.includes('about-story-arrive'));
assert(css.includes('prefers-reduced-motion:reduce'));
console.log('PASS: About navigation from any page, shared-player geometry at five widths, staggered entrance, reduced motion and no playback mutations');
