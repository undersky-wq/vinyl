export function shuffledShelf<T>(items: readonly T[], seed: number): T[] {
  const rows=[...items];let value=(seed*2654435761)>>>0;
  const random=()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/4294967296;};
  for(let i=rows.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[rows[i],rows[j]]=[rows[j],rows[i]];}
  return rows;
}

export class ShelfShakeDetector {
  private gravity: [number,number,number] | null=null;
  private lastSample: number | null=null;
  private aboveThreshold=false;
  private peakDirection: [number,number,number] | null=null;
  private lastPeak=-Infinity;
  private lastShake=-Infinity;
  private peaks=0;
  sample(x:number,y:number,z:number,now:number) {
    if(![x,y,z,now].every(Number.isFinite))return false;
    const previousTime=this.lastSample;this.lastSample=now;
    if(!this.gravity||previousTime===null||now<previousTime||now-previousTime>1000){
      this.gravity=[x,y,z];this.peaks=0;this.lastPeak=-Infinity;this.aboveThreshold=false;this.peakDirection=null;return false;
    }
    // Estimate gravity in elapsed time, then measure the actual motion force.
    // Adjacent-sample differences miss normal shakes on high-frequency sensors.
    const alpha=1-Math.exp(-Math.max(0,now-previousTime)/600);
    const values=[x,y,z];
    const motion=values.map((value,index)=>{this.gravity![index]+=(value-this.gravity![index])*alpha;return value-this.gravity![index];});
    const force=Math.hypot(...motion);
    if(now-this.lastShake<3000){this.peaks=0;this.aboveThreshold=false;return false;}
    if(force<3.25){this.aboveThreshold=false;return false;}
    if(force<6.5)return false;
    const reversed=this.peakDirection!==null&&motion.reduce((dot,value,index)=>dot+value*this.peakDirection![index],0)<-force*.25;
    if((this.aboveThreshold&&!reversed)||now-this.lastPeak<90)return false;
    this.aboveThreshold=true;this.peakDirection=motion.map(value=>value/force) as [number,number,number];
    this.peaks=now-this.lastPeak<750?this.peaks+1:1;this.lastPeak=now;
    if(this.peaks<2)return false;
    this.lastShake=now;this.peaks=0;return true;
  }
}

export function motionAcceleration(event: Pick<DeviceMotionEvent,'accelerationIncludingGravity'|'acceleration'>): [number,number,number] | null {
  for(const value of [event.accelerationIncludingGravity,event.acceleration]){
    if(value&&typeof value.x==='number'&&typeof value.y==='number'&&typeof value.z==='number'&&[value.x,value.y,value.z].every(Number.isFinite))return [value.x,value.y,value.z];
  }
  return null;
}
