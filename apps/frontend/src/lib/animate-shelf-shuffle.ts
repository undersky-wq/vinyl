type Frame = Record<string,string>;
const frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
const read=(element:HTMLElement):Frame=>{
  const s=getComputedStyle(element);
  return {left:s.left,top:s.top,width:s.width,height:s.height,marginLeft:s.marginLeft,marginTop:s.marginTop,transform:s.transform,transformOrigin:s.transformOrigin,opacity:s.opacity};
};

// Original sleeves burst out, gather in a shuffled packet, then fan back out.
export async function animateShelfShuffle(root:HTMLElement,reorder:()=>void,signal:AbortSignal){
  const animations:Animation[]=[];
  const participants=new Set<HTMLElement>();
  const cancel=()=>animations.forEach(a=>a.cancel());
  signal.addEventListener('abort',cancel,{once:true});
  try{
    await frame();await frame();if(signal.aborted||!root.isConnected)return;
    if(matchMedia('(prefers-reduced-motion: reduce)').matches){reorder();return;}
    const transport=root.querySelector<HTMLElement>('.paper-transport');if(!transport){reorder();return;}
    const bounds=root.getBoundingClientRect(),parent=transport.getBoundingClientRect();
    const contentTop=Number.parseFloat(getComputedStyle(root).getPropertyValue('--grid-top'))||100;
    const contentBottom=root.clientHeight-90;
    const size=Math.min(root.clientWidth*.38,190);
    const left=bounds.left+root.clientWidth/2-size/2-parent.left;
    const top=bounds.top+(contentTop+contentBottom)/2-size/2-parent.top;
    const visible=(element:HTMLElement)=>{const r=element.getBoundingClientRect();return r.right>bounds.left-40&&r.left<bounds.right+40&&r.bottom>bounds.top+contentTop&&r.top<bounds.top+contentBottom;};
    const cards=Array.from(root.querySelectorAll<HTMLElement>('.paper-record'));
    cards.forEach(element=>element.classList.remove('is-sleeve-squared'));
    const initial=cards.filter(visible);
    const phase=performance.now()*.001;
    const burst=(rank:number):Frame=>{
      const angle=rank*2.399963+phase,radius=Math.hypot(root.clientWidth,root.clientHeight)*.65+(rank%5)*18;
      return {left:`${left+Math.cos(angle)*radius}px`,top:`${top+Math.sin(angle)*radius}px`,width:`${size}px`,height:`${size}px`,marginLeft:'0px',marginTop:'0px',transformOrigin:'50% 50%',transform:`perspective(1000px) rotateX(${(rank%7-3)*38}deg) rotateY(${(rank%2?1:-1)*(130+rank%3*70)}deg) rotateZ(${(rank%2?1:-1)*65}deg) scale(.68)`,opacity:'0'};
    };
    const pack=(rank:number):Frame=>({left:`${left+rank*.3}px`,top:`${top+rank*.22}px`,width:`${size}px`,height:`${size}px`,marginLeft:'0px',marginTop:'0px',transformOrigin:'50% 50%',transform:`perspective(1000px) rotateZ(${(rank%5-2)*.55}deg)`,opacity:'1'});
    const run=async(rows:HTMLElement[],keyframes:(element:HTMLElement,rank:number)=>Frame[],duration:number,delay:(rank:number)=>number)=>{
      const current=rows.map((element,rank)=>{const animation=element.animate(keyframes(element,rank),{duration,delay:delay(rank),easing:'cubic-bezier(.45,0,.25,1)',fill:'both'});animations.push(animation);return animation;});
      await Promise.all(current.map(animation=>animation.finished));
      return current;
    };
    initial.forEach(element=>{participants.add(element);element.classList.add('is-shuffle-part');});
    root.dataset.shuffleMask='true';root.dataset.shuffleAnimated=String(initial.length);
    await run(initial,(element,rank)=>[read(element),burst(rank)],1100,rank=>Math.min(300,rank*8));
    if(signal.aborted)return;
    reorder();await frame();await frame();if(signal.aborted||!root.isConnected)return;
    // Hide only during the off-screen handover. There is no frame in which
    // the old order or the new destination can flash through the transition.
    participants.forEach(element=>element.classList.remove('is-shuffle-part'));participants.clear();
    cancel();animations.length=0;
    const destinationCards=Array.from(root.querySelectorAll<HTMLElement>('.paper-record'));
    const rows=destinationCards.filter(visible);
    const images=rows.flatMap(element=>Array.from(element.querySelectorAll<HTMLImageElement>('.paper-record-front img')));
    images.forEach(image=>image.loading='eager');
    await Promise.race([Promise.all(images.map(image=>image.decode?.().catch(()=>undefined))),new Promise(resolve=>setTimeout(resolve,220))]);
    if(signal.aborted)return;
    rows.forEach(element=>participants.add(element));root.dataset.shuffleAnimated=String(rows.length);
    rows.forEach(element=>element.classList.add('is-shuffle-part'));
    const destinations=new Map(rows.map(element=>[element,read(element)]));
    await run(rows,(_element,rank)=>[burst(rank),pack(rank)],1250,rank=>Math.min(300,rank*7));
    if(signal.aborted)return;
    await run(rows,(element,rank)=>[pack(rank),destinations.get(element)!],1100,rank=>Math.min(250,rank*6));
  }catch(error){if(!signal.aborted&&!(error instanceof DOMException&&error.name==='AbortError'))throw error;}
  finally{root.removeAttribute('data-shuffle-mask');cancel();participants.forEach(element=>element.classList.remove('is-shuffle-part'));signal.removeEventListener('abort',cancel);}
}
