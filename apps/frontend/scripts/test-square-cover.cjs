const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/square-cover.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: exportsObject });
const crop = exportsObject.squareCoverBounds;
assert.equal(crop(1200, 800, 50, 50, 1).side, 800);
assert.equal(crop(1200, 800, 50, 50, 1).x, 200);
assert.equal(crop(800, 1200, 50, 100, 1).y, 400);
assert.equal(crop(800, 1200, 50, 50, 2).side, 400);
for (const [width, height] of [[1200,800], [800,1200], [100,100]]) for (const zoom of [1,2,3]) for (const value of [-100,0,50,100,200]) {
  const bounds = crop(width,height,value,value,zoom);
  assert(bounds.x >= 0 && bounds.y >= 0);
  assert(bounds.x + bounds.side <= width && bounds.y + bounds.side <= height);
}
console.log('PASS: square crops preserve aspect ratio, zoom and stay within landscape/portrait/square sources');
const rotate = exportsObject.squareCoverTransform;
for (const [width,height] of [[1200,800],[800,1200],[200,200]]) for (const angle of [-180,-135,-90,-45,0,30,90,180]) for (const zoom of [1,2,3]) for (const value of [0,50,100]) {
  const area = rotate(width,height,value,value,zoom,angle);
  for (const dx of [-area.side/2,area.side/2]) for (const dy of [-area.side/2,area.side/2]) {
    const x=area.centerX+dx*Math.cos(area.radians)+dy*Math.sin(area.radians);
    const y=area.centerY-dx*Math.sin(area.radians)+dy*Math.cos(area.radians);
    assert(x>=-1e-8&&x<=width+1e-8&&y>=-1e-8&&y<=height+1e-8,'rotated crop corners stay inside the original image');
  }
}
console.log('PASS: rotated crops stay filled at all angles, pan positions and zoom levels');
