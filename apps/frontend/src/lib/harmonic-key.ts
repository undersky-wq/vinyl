export type TrackSort = { field: 'key' | 'bpm'; direction: 'asc' | 'desc' } | null;
const majorColors = ['#d67adf','#8a7aa3','#6f93c7','#55b8e9','#49d2d5','#50c989','#73e86e','#aee650','#ffe75a','#ffb85b','#e9484e','#f544a1'];
const minorColors = ['#dfb2e5','#b7afc5','#b6c8df','#9ad9ea','#86dddd','#97d8c0','#9def98','#cceb9b','#fff0a1','#ffd8a1','#ef9295','#f28bc4'];
const majorPitches = [0,7,2,9,4,11,6,1,8,3,10,5];
const pitches: Record<string,number> = { C:0,D:2,E:4,F:5,G:7,A:9,B:11 };

function luminance(channels: number[]) { return channels.map(n=>{const c=n/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0); }
function readableOnLight(hex: string) {
  const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));let factor=1;
  while(1.05/(luminance(rgb.map(n=>Math.round(n*factor)))+.05)<4.5)factor-=.02;
  return '#'+rgb.map(n=>Math.round(n*factor).toString(16).padStart(2,'0')).join('');
}
const colors=[majorColors,minorColors].map(palette=>palette.map(dark=>({dark,light:readableOnLight(dark)})));

export function parseHarmonicKey(value?: string | null) {
  if(!value?.trim())return null;
  const text=value.trim().replace(/♯/g,'#').replace(/♭/g,'b');
  const open=/^(1[0-2]|[1-9])([md])$/i.exec(text),camelot=/^(1[0-2]|[1-9])([ab])$/i.exec(text);
  let circleIndex: number,minor: boolean;
  if(open){circleIndex=Number(open[1])-1;minor=open[2].toLowerCase()==='m';}
  else if(camelot){circleIndex=(Number(camelot[1])+4)%12;minor=camelot[2].toLowerCase()==='a';}
  else {
    const match=/^([a-g])([#b]?)(m|minor|major)?$/i.exec(text.replace(/\s+/g,''));if(!match)return null;
    minor=/^(m|minor)$/i.test(match[3]||'');
    const pitch=(pitches[match[1].toUpperCase()]+(match[2]==='#'?1:match[2].toLowerCase()==='b'?-1:0)+12)%12;
    circleIndex=majorPitches.indexOf((pitch+(minor?3:0))%12);
  }
  return { circleIndex,minor,order:circleIndex*2+(minor?0:1),...colors[minor?1:0][circleIndex] };
}
export function getHarmonicKeyOrder(value?: string | null) { return parseHarmonicKey(value)?.order ?? null; }
export function filterByHarmonicKeys<T>(items:readonly T[],keys:readonly number[],value:(item:T)=>string|null|undefined):T[]{
  if(!keys.length)return [...items];
  const selected=new Set(keys);
  return items.filter(item=>{const key=getHarmonicKeyOrder(value(item));return key!==null&&selected.has(key);});
}
export function cycleTrackSort(current: TrackSort,field: NonNullable<TrackSort>['field']): TrackSort {
  return !current||current.field!==field?{field,direction:'desc'}:current.direction==='desc'?{field,direction:'asc'}:null;
}
export function sortByTrackMetadata<T>(items: readonly T[],sort: TrackSort,metadata: (item:T)=>{bpm?:number|null;key?:string|null}): T[] {
  if(!sort)return [...items];
  return items.map((item,index)=>({item,index,meta:metadata(item)})).sort((a,b)=>{
    const av=sort.field==='key'?getHarmonicKeyOrder(a.meta.key):a.meta.bpm,bv=sort.field==='key'?getHarmonicKeyOrder(b.meta.key):b.meta.bpm;
    const an=typeof av==='number'&&Number.isFinite(av)?av:null,bn=typeof bv==='number'&&Number.isFinite(bv)?bv:null;
    if(an===null)return bn===null?a.index-b.index:1;if(bn===null)return -1;
    return (sort.direction==='asc'?an-bn:bn-an)||a.index-b.index;
  }).map(row=>row.item);
}
