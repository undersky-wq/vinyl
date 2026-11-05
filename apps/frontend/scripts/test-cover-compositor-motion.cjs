const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/lib/cover-compositor-motion.ts'), 'utf8');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText, {exports:exportsObject});
const {coverCompositorFrames,coverEntryFrame} = exportsObject;
const identity = () => [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
function mul(a,b) {
  const out=Array(16).fill(0);
  for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)out[c*4+r]+=a[k*4+r]*b[c*4+k];
  return out;
}
const translate=(x,y,z=0)=>{const m=identity();m[12]=x;m[13]=y;m[14]=z;return m;};
const scale=(x,y,z=1)=>{const m=identity();m[0]=x;m[5]=y;m[10]=z;return m;};
function cssMatrix(css) {
  if(css==='none')return identity();
  let result=identity();
  for(const match of css.matchAll(/(translate3d|scale3d|matrix3d|matrix)\(([^)]+)\)/g)) {
    const v=match[2].split(',').map(parseFloat);
    const m=match[1]==='translate3d'?translate(...v):match[1]==='scale3d'?scale(...v):match[1]==='matrix3d'?v:
      [v[0],v[1],0,0,v[2],v[3],0,0,0,0,1,0,v[4],v[5],0,1];
    result=mul(result,m);
  }
  return result;
}
function point(matrix,x,y) {
  const w=matrix[3]*x+matrix[7]*y+matrix[15];
  return [(matrix[0]*x+matrix[4]*y+matrix[12])/w,(matrix[1]*x+matrix[5]*y+matrix[13])/w];
}
function world(frame, matrix=cssMatrix(frame.transform), zeroOrigin=false) {
  const o=zeroOrigin?[0,0,0]:frame.transformOrigin.split(' ').map(parseFloat);
  const m=frame.margin.split(' ').map(parseFloat);
  return mul(translate(parseFloat(frame.left)+(m[3]??m[1]??m[0]),parseFloat(frame.top)+m[0]),
    mul(translate(...o),mul(matrix,translate(-o[0],-o[1],-(o[2]||0)))));
}
const tilt=identity();
const angle=-55*Math.PI/180;
tilt[5]=Math.cos(angle);tilt[6]=Math.sin(angle);tilt[9]=-Math.sin(angle);tilt[10]=Math.cos(angle);
const perspective=identity();perspective[11]=-1/1200;
const stackTransform=`matrix3d(${mul(perspective,tilt).join(',')})`;
const frames=[
  {left:'-80px',top:'490px',width:'160px',height:'160px',margin:'0px',transform:'matrix(0.76,0.43,0,1,0,0)',transformOrigin:'0px 0px 0px',opacity:'1'},
  {left:'74px',top:'315px',width:'242px',height:'242px',margin:'0px',transform:stackTransform,transformOrigin:'121px 121px 0px',opacity:'1'},
  {left:'14px',top:'200px',width:'83px',height:'83px',margin:'0px',transform:'none',transformOrigin:'41.5px 41.5px 0px',opacity:'1'},
  {left:'14px',top:'150px',width:'72px',height:'72px',margin:'4px 0px 0px 3px',transform:'none',transformOrigin:'36px 36px 0px',opacity:'1'},
  {left:'900px',top:'250px',width:'420px',height:'420px',margin:'-12px -20px',transform:stackTransform,transformOrigin:'210px 210px 0px',opacity:'.6'},
  {left:'640px',top:'210px',width:'498px',height:'498px',margin:'-36px 0px 0px -249px',transform:'none',transformOrigin:'0px 0px 0px',opacity:'1'},
];
let combinations=0;
for(const before of frames)for(const after of frames) {
  const keyframes=coverCompositorFrames(before,after);
  assert.ok(keyframes);
  for(const frame of keyframes)assert.deepEqual(Object.keys(frame).sort(),['opacity','transform','transformOrigin']);
  for(const [x,y]of [[0,0],[1,0],[0,1],[1,1],[.5,.5]]) {
    const start=point(world(after,cssMatrix(keyframes[0].transform),true),x*parseFloat(after.width),y*parseFloat(after.height));
    const end=point(world(after,cssMatrix(keyframes[1].transform),true),x*parseFloat(after.width),y*parseFloat(after.height));
    const original=point(world(before),x*parseFloat(before.width),y*parseFloat(before.height));
    const destination=point(world(after),x*parseFloat(after.width),y*parseFloat(after.height));
    for(let i=0;i<2;i++){assert.ok(Math.abs(start[i]-original[i])<1e-7);assert.ok(Math.abs(end[i]-destination[i])<1e-7);}
  }
  combinations++;
}
assert.equal(coverCompositorFrames({...frames[0],width:'0px'},frames[1]),null);
assert.equal(coverCompositorFrames(frames[0],{...frames[1],height:'NaN'}),null);
for(const layout of ['shelf','stack','grid','tracks'])for(const [width,height]of [[390,844],[1280,720]]) {
  const captured=new Map([['40',frames[layout==='stack'?1:0]],['44',frames[layout==='stack'?1:0]]]);
  for(const index of ['0','39','45','400']) {
    const entry=coverEntryFrame(captured,index,frames[2],{layout,width,height});
    const corners=[[0,0],[1,0],[0,1],[1,1]].map(([x,y])=>point(world(entry),x*parseFloat(entry.width),y*parseFloat(entry.height)));
    const xs=corners.map(p=>p[0]),ys=corners.map(p=>p[1]);
    assert(Math.max(...xs)<0||Math.min(...xs)>width||Math.max(...ys)<0||Math.min(...ys)>height,`${layout}: new cover starts outside the viewport`);
    assert.equal(entry.opacity,1,'Fly from outside rather than fade at the destination');
    assert.equal(entry.transform,captured.get('40').transform,'Preserve the source deck tilt');
    assert(coverCompositorFrames(entry,frames[2]));
  }
  assert(coverCompositorFrames(coverEntryFrame(new Map(),'0',frames[2],{layout,width,height}),frames[2]));
}
const archive=fs.readFileSync(path.join(__dirname,'../src/components/paper-archive.tsx'),'utf8');
const start=archive.indexOf('if (compositorScroll) {',archive.indexOf('function changeCollectionLayout'));
const end=archive.indexOf("if ((target === 'stack'",start);
const branch=archive.slice(start,end);
assert(branch.includes('captureCoverTransition(true)'));
assert(branch.includes("target === 'tracks' ? 2 : 0, false"));
assert(!branch.includes('requestAnimationFrame'));
assert(branch.includes('prefers-reduced-motion'));
assert(archive.includes('.filter(card => !context.animated.has(card))'));
assert(archive.includes('performance.now() - context.started < context.duration'));
assert(archive.includes('card.dataset.coverMotion = captured ?'));
assert(!archive.includes('archive-compositor-preview.css'));
assert(!archive.includes('coverNavigationFrames'),'Keep navigation animations unchanged');
assert(archive.includes('coverTransitionIsLayout.current || (!stackMode && gridMix < .01)'));
assert(archive.includes('stackTransitioning || shelfTransitioning'));
assert(archive.includes('duration:coverTransitionIsLayout.current ? 1200 : 1050'));
assert(archive.includes('next !== selected'));
const originalCss=fs.readFileSync(path.join(__dirname,'../src/components/record-archive.css'),'utf8');
assert(originalCss.includes('@keyframes paper-label-enter{'));
assert(originalCss.includes('clip-path:inset(100% 0 0)'),'Keep the original text reveal');
console.log(`PASS: ${combinations} bidirectional Shelf/Stack/Grid/Tracks endpoints; five projected points each; 3D perspective, origins, margins, scaling, compositor-only keyframes and no per-frame layout loop`);
console.log('PASS: cover fly-ins and late mounts preserved; navigation and release text use their original animations');
