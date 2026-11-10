import { strict as assert } from 'node:assert';
import { shelfMobileLayout } from '../src/lib/shelf-mobile-layout.ts';
import { readFileSync } from 'node:fs';
for (const [width,height] of [[320,568],[375,667],[390,844],[393,851],[430,932],[700,500]]) {
  for (const compact of [false,true]) {
    const playerTop=height-80;
    const layout=shelfMobileLayout(width,height,84,88,38,playerTop,compact);
    assert.ok(layout.headingTop>=84);
    if(compact){assert.equal(layout.headingTop-84,16,'APK search-to-context spacing');assert.equal(layout.contentTop-layout.headingTop,35,'APK context-to-content rhythm');}
    else assert.ok(layout.contentTop>=layout.headingTop+38);
    assert.ok(height-layout.bottom<playerTop);
    assert.ok(layout.panelHeight<=height-layout.bottom-layout.contentTop);
    assert.ok(layout.coverSize<=180);
    assert.ok(layout.shelfFloor>layout.contentTop);
  }
}
for (const height of [600,667,744,844]) {
  const layout=shelfMobileLayout(390,height,84,88,38,height-24,false);
  assert.ok(layout.panelHeight>=96, 'iPhone genre panel must show more than All');
  assert.ok(layout.coverSize<=160, 'Shelf reduction remains bounded on normal screens');
}
console.log('PASS: reserved zones on 6 screen sizes and iPhone toolbar heights');
const raised = shelfMobileLayout(390,844,84,88,38,764,false);
const gap = 11.7;
const previousFloor = Math.min(844-raised.bottom-gap, raised.contentTop+gap+28+raised.coverSize*.715+(390+raised.coverSize*.38)*.28);
assert.ok(previousFloor-raised.shelfFloor>=30 && previousFloor-raised.shelfFloor<=40, 'normal phone Shelf moves up without resizing covers');
assert.ok(raised.panelHeight>192, 'genres extend upward while retaining their lower boundary');
const compact = shelfMobileLayout(390,844,84,88,38,764,true);
const spaced = shelfMobileLayout(390,844,84,120,38,764,false,8);
assert.ok(Math.abs(spaced.headingTop - spaced.navigationTop - 120 - 8)<1e-8, 'Shelf title matches the gap between Tracks and Favorites');
assert.equal(shelfMobileLayout(390,844,84,88,38,764,true,48).headingTop,compact.headingTop,'Other layouts ignore Shelf title spacing');
assert.equal(compact.shelfFloor, compact.contentTop+(844-compact.bottom-compact.contentTop)*.62, 'other layouts keep their existing geometry');
const css = readFileSync(new URL('../src/components/shelf-mobile-layout.css', import.meta.url), 'utf8');
const archive = readFileSync(new URL('../src/components/paper-archive.tsx', import.meta.url), 'utf8');
assert(!css.includes('--stack-size:var(--cover)'));
assert(!archive.includes('const coverSize = stackMode ? shelfMobileLayout('));
assert(archive.includes("'--cover': `${layout.coverSize}px`"));
console.log('PASS: original Shelf/Stack geometry retained; shared quality does not control displayed dimensions');
