const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');
const root = path.join(__dirname,'..');
const compilerOptions={module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX};
function load(file, requireMock) {
  const exports={};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions}).outputText,
    {exports,require:requireMock,document:{getElementById:id=>({click:()=>picked.push(id)})},confirm:()=>true});
  return exports;
}
const helpers=load('src/lib/release-images.ts',require);
let state=[],cursor=0;const picked=[];const uploaded=[];
const svg=color=>`data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="112" height="112"><rect width="112" height="112" fill="${color}"/></svg>`)}`;
const release={id:'demo',artist:'Artist',title:'Release',year:2026,styles:['House'],genres:[],tracks:[],coverStorageUrl:svg('#567'),coverImageUrl:svg('#567'),images:[
  {id:'front',storageKey:'front.webp',url:svg('#567'),type:'COVER',isBackCover:false},
  {id:'back',storageKey:'back.webp',url:svg('#756'),type:'GALLERY',isBackCover:true},
  {id:'discogs',storageKey:'gallery.jpg',url:svg('#675'),type:'GALLERY',isBackCover:false},
]};
const SquareInput=props=>React.createElement('div',{className:'square-cover-control'},React.createElement('input',{type:'file',id:props.id,disabled:props.disabled}));
let serverRelease=release;const hidden=[];let failHide=false;
const api={
  getRelease:async()=>serverRelease,
  removeReleaseCover:async id=>{
    if(failHide)throw Error('hide unavailable');
    hidden.push(['front',id]);
    serverRelease={...serverRelease,coverStorageUrl:null,coverMediumStorageUrl:null,coverImageUrl:null,images:serverRelease.images.map(image=>({...image,type:'GALLERY'}))};
    return {success:true};
  },
  removeReleaseBackCover:async(id,side='back')=>{
    if(failHide)throw Error('hide unavailable');
    hidden.push([side,id]);
    const flag=side==='front2'?'isSecondFrontCover':side==='back2'?'isSecondBackCover':'isBackCover';
    serverRelease={...serverRelease,...(side==='back'?{backCoverUrl:null}:{}),images:serverRelease.images.map(image=>({...image,[flag]:false}))};
    return {success:true};
  },
  selectReleaseCover:async(id,imageId,side)=>{
    const photo=serverRelease.images.find(image=>image.id===imageId);
    serverRelease={...serverRelease,coverStorageUrl:side==='front'?photo.url:serverRelease.coverStorageUrl,
      images:serverRelease.images.map(image=>({...image,type:side==='front'?(image.id===imageId?'COVER':'GALLERY'):image.type,isBackCover:side==='back'?image.id===imageId:image.isBackCover,isSecondFrontCover:side==='front2'?image.id===imageId:image.isSecondFrontCover,isSecondBackCover:side==='back2'?image.id===imageId:image.isSecondBackCover}))};
    return serverRelease;
  },
  uploadReleaseCover:async(id,file)=>{uploaded.push(['front',id,file]);return {...release,coverStorageUrl:svg('#abc'),images:[...release.images.map(image=>({...image,type:'GALLERY'})),{id:'new-front',storageKey:'new-front.webp',url:svg('#abc'),type:'COVER',isBackCover:false}]};},
  uploadReleaseBackCover:async(id,file,side='back')=>{
    uploaded.push([side,id,file]);
    const flag=side==='front2'?'isSecondFrontCover':side==='back2'?'isSecondBackCover':'isBackCover';
    return {...release,images:release.images.map(image=>({...image,[flag]:image.id==='discogs'}))};
  },
};
const {ShelfReleaseForm}=load('src/components/shelf-release-form.tsx',name=>{
  if(name==='react')return {...React,useEffect:()=>{},useState:initial=>{const index=cursor++;if(!(index in state))state[index]=initial;return[state[index],value=>{state[index]=typeof value==='function'?value(state[index]):value;}];}};
  if(name==='../lib/api')return api;
  if(name==='../lib/release-images')return helpers;
  if(name==='./square-cover-input')return {SquareCoverInput:SquareInput};
  if(name==='./track-upload-button')return {TrackUploadButton:()=>null};
  return require(name);
});
function render(data=release,lang='ru',reset=true){if(reset)state=[];cursor=0;return ShelfReleaseForm({release:data,lang});}
function nodes(element,filter){if(!element||typeof element!=='object')return[];return [...(filter(element)?[element]:[]),...React.Children.toArray(element.props?.children).flatMap(child=>nodes(child,filter))];}
function controls(element){return nodes(element,node=>node.type==='button'&&node.props.className==='shelf-form-cover');}
(async()=>{
  const tree=render();
  assert.equal(nodes(tree,node=>node.type==='section'&&node.props.className==='shelf-form-gallery').length,1);
  assert.equal(nodes(nodes(tree,node=>node.type==='header')[0],node=>node.type==='img'||node.type===SquareInput).length,0,'old two-cover header is removed');
  assert.equal(controls(tree).length,2);
  controls(tree).forEach(button=>button.props.onClick());
  assert.deepEqual(picked,['front-demo','back-demo']);
  const inputs=nodes(tree,node=>node.type===SquareInput);
  assert.equal(inputs.length,2);assert(inputs.every(input=>input.props.showResultPreview===false));
  const file={name:'cropped.webp'};
  inputs[0].props.onChange(file);await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(uploaded[0],['front','demo',file]);
  const updated=render(release,'ru',false);
  assert(nodes(updated,node=>node.type==='img').some(image=>image.props.src===svg('#abc')),'successful upload is shown in the gallery itself');
  render();inputs[1].props.onChange(file);await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(uploaded[1],['back','demo',file]);
  const both=render({...release,images:[{...release.images[0],isBackCover:true}]});
  assert.equal(controls(both).length,2,'both sides can use one image and retain separate upload actions');
  serverRelease=release;
  const hideTree=render();
  nodes(hideTree,node=>node.props?.['aria-label']==='Не показывать обложку: Пластинка 1 · сторона A')[0].props.onClick();
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(hidden[0],['front','demo']);
  let hiddenTree=render(release,'ru',false);
  assert.equal(nodes(hiddenTree,node=>node.props?.['aria-label']==='Не показывать обложку: Пластинка 1 · сторона A').length,0);
  assert.equal(nodes(hiddenTree,node=>node.props?.['aria-label']==='Не показывать обложку: Пластинка 1 · сторона B').length,1,'front hiding leaves the back intact');
  assert.deepEqual(serverRelease.images.map(image=>image.storageKey),release.images.map(image=>image.storageKey));
  const frontFigure=nodes(hiddenTree,node=>node.type==='figure').find(figure=>nodes(figure,node=>node.type==='img'&&node.props.src===release.images[0].url).length);
  nodes(frontFigure,node=>node.type==='button'&&React.Children.toArray(node.props.children).includes('Пластинка 1 · сторона A'))[0].props.onClick();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(serverRelease.images[0].type,'COVER','hidden photo can be restored from the existing gallery');
  assert.equal(uploaded.length,2,'restoring an image never reuploads its file');
  hiddenTree=render(release,'ru',false);
  nodes(hiddenTree,node=>node.props?.['aria-label']==='Не показывать обложку: Пластинка 1 · сторона B')[0].props.onClick();
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(hidden[1],['back','demo']);
  assert(serverRelease.images.some(image=>image.type==='COVER'),'hiding back leaves front intact');
  assert.equal(serverRelease.images.length,release.images.length);
  serverRelease={...release,images:[{...release.images[0],isBackCover:true}]};
  let shared=render(serverRelease);
  nodes(shared,node=>node.props?.['aria-label']==='Не показывать обложку: Пластинка 1 · сторона A')[0].props.onClick();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(serverRelease.images[0].isBackCover,true,'one shared photo stays attached to back when front is hidden');
  assert.equal(serverRelease.images.length,1);
  serverRelease=release;failHide=true;
  shared=render();
  nodes(shared,node=>node.props?.['aria-label']==='Не показывать обложку: Пластинка 1 · сторона A')[0].props.onClick();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(state[0].images[0].type,'COVER','failed hiding leaves the UI selection unchanged');
  failHide=false;
  const double={...release,tracks:[{id:'c',position:'C1',title:'Track C',artists:[],audioFiles:[]}]};
  serverRelease=double;
  let doubleTree=render(double);
  for(const lang of ['ru','en']) {
    const section=nodes(render(double,lang),node=>node.type==='section'&&node.props.className==='shelf-form-gallery')[0];
    const html=renderToStaticMarkup(section);
    for(const disc of [1,2])for(const side of ['A','B'])assert(html.includes(lang==='ru'?`Пластинка ${disc} · сторона ${side}`:`Record ${disc} · side ${side}`));
    const labels=html.replace(/<[^>]*>/g,' ')+' '+nodes(section,node=>node.props?.['aria-label']||node.props?.alt).map(node=>node.props['aria-label']||node.props.alt).join(' ');
    assert(!/лицев|обратн|Винил|C\/D|side [CD]|сторона [CD]|Front|Back/i.test(labels),'gallery uses record and side labels only');
  }
  doubleTree=render(double);
  const doubleInputs=nodes(doubleTree,node=>node.type===SquareInput);
  assert.equal(doubleInputs.length,4,'C/D tracks automatically show the second vinyl inputs');
  const discogsFigure=nodes(doubleTree,node=>node.type==='figure').find(figure=>nodes(figure,node=>node.type==='img'&&node.props.src===release.images[2].url).length);
  const chooseC=nodes(discogsFigure,node=>node.type==='button'&&React.Children.toArray(node.props.children).includes('Пластинка 2 · сторона A'))[0];
  chooseC.props.onClick();await new Promise(resolve=>setImmediate(resolve));
  assert(serverRelease.images[2].isSecondFrontCover);
  assert.equal(serverRelease.images[0].type,'COVER','choosing C preserves A');
  assert.equal(serverRelease.images[1].isBackCover,true,'choosing C preserves B');
  doubleTree=render(double,'ru',false);
  const hideC=nodes(doubleTree,node=>node.props?.['aria-label']==='Не показывать обложку: Пластинка 2 · сторона A')[0];
  hideC.props.onClick();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(serverRelease.images[2].isSecondFrontCover,false);
  assert.equal(serverRelease.images.length,release.images.length,'hiding C keeps the original gallery photo');
  render(double);
  doubleInputs[3].props.onChange(file);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(uploaded.at(-1)[0],'back2','D uploads target the second vinyl');
  const single=render(release);
  nodes(single,node=>node.props?.className==='shelf-form-gallery__disc-toggle')[0].props.onClick();
  assert.equal(nodes(render(release,'ru',false),node=>node.type===SquareInput).length,4,'second vinyl can also be enabled before C/D tracks exist');
  const empty=render({...release,coverStorageUrl:null,coverImageUrl:null,images:[]});
  assert.equal(controls(empty).length,2,'uploads remain available for an empty gallery');
  assert.equal(nodes(empty,node=>node.props?.className==='shelf-form-cover-placeholder').length,2);
  console.log('PASS: one gallery, upload handlers, independent hide/restore, shared-side image, preserved files and failure handling');
  if(process.env.GALLERY_LAYOUT_BROWSER==='1') {
    const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
    const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
    try {
      const page=await browser.newPage();
      const css=['src/app/globals.css','src/components/shelf-web.css','src/components/square-cover-input.css'].map(file=>fs.readFileSync(path.join(root,file),'utf8')).join('\n');
      for(const width of [390,1440])for(const theme of ['light','dark'])for(const data of [release,double,{...release,coverStorageUrl:null,coverImageUrl:null,images:[]}]) {
        await page.setViewportSize({width,height:1000});
        await page.setContent(`<html data-visual-variant="shelf" data-shelf-theme="${theme}"><head><style>${css}</style></head><body><dialog class="shelf-editor" open>${renderToStaticMarkup(render(data))}</dialog></body></html>`);
        assert.equal(await page.locator('.shelf-release-form header img').count(),0);
        assert.equal(await page.locator('.shelf-form-gallery .shelf-form-cover').count(),data===double?4:2);
        assert(await page.locator('.shelf-form-gallery input[type=file]').evaluateAll(inputs=>inputs.every(input=>getComputedStyle(input).display==='none')));
        const clipped=await page.locator('.shelf-form-gallery .shelf-form-cover').evaluateAll(buttons=>buttons.some(button=>{const figure=button.closest('figure');const photo=figure.querySelector('img,.shelf-form-cover-placeholder');return button.getBoundingClientRect().top<photo.getBoundingClientRect().bottom;}));
        assert.equal(clipped,false,'upload buttons stay below the corresponding artwork');
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no mobile horizontal overflow');
      }
      console.log('PASS: gallery layout at mobile/desktop widths, both themes and missing covers');
    }finally{await browser.close();}
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
