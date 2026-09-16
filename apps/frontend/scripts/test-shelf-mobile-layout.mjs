import { strict as assert } from 'node:assert';
import { shelfMobileLayout } from '../src/lib/shelf-mobile-layout.ts';
for (const [width,height] of [[320,568],[375,667],[390,844],[393,851],[430,932],[700,500]]) {
  for (const compact of [false,true]) {
    const playerTop=height-80;
    const layout=shelfMobileLayout(width,height,84,88,38,playerTop,compact);
    assert.ok(layout.headingTop>=84);
    assert.ok(layout.contentTop>=layout.headingTop+38);
    if (compact) assert.ok(layout.contentTop-layout.headingTop-38>=36-1e-8, 'Grid/Tracks must keep a clear gap below the heading');
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
