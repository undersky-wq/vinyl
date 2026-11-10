export function shuffledShelf<T>(items: readonly T[], seed: number): T[] {
  const rows=[...items];let value=(seed*2654435761)>>>0;
  const random=()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/4294967296;};
  for(let i=rows.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[rows[i],rows[j]]=[rows[j],rows[i]];}
  return rows;
}

export class ShelfShakeDetector {
  private previous: [number,number,number] | null=null;
  private lastPeak=-Infinity;
  private lastShake=-Infinity;
  private peaks=0;
  sample(x:number,y:number,z:number,now:number) {
    if(![x,y,z,now].every(Number.isFinite))return false;
    const previous=this.previous;this.previous=[x,y,z];
    if(!previous||now-this.lastShake<3000)return false;
    const impulse=Math.hypot(x-previous[0],y-previous[1],z-previous[2]);
    if(impulse<12||now-this.lastPeak<90)return false;
    this.peaks=now-this.lastPeak<650?this.peaks+1:1;this.lastPeak=now;
    if(this.peaks<2)return false;
    this.lastShake=now;this.peaks=0;return true;
  }
}
