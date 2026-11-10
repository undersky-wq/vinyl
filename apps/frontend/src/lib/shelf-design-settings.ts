'use client';
import {useEffect,useState} from 'react';
export type ShelfDesignSettings={waveEnabled:boolean;spinEnabled:boolean;shuffleEnabled:boolean;shakeSensitivity:number};
export const DEFAULT_SHELF_DESIGN:ShelfDesignSettings={waveEnabled:true,spinEnabled:true,shuffleEnabled:true,shakeSensitivity:50};
const eventName='shelf-preview-design-settings';
function normalize(value:{shelfWaveEnabled?:boolean;shelfSpinEnabled?:boolean;shelfShuffleEnabled?:boolean;shelfShakeSensitivity?:number}):ShelfDesignSettings{return {waveEnabled:value.shelfWaveEnabled!==false,spinEnabled:value.shelfSpinEnabled!==false,shuffleEnabled:value.shelfShuffleEnabled!==false,shakeSensitivity:typeof value.shelfShakeSensitivity==='number'&&Number.isInteger(value.shelfShakeSensitivity)&&value.shelfShakeSensitivity>=0&&value.shelfShakeSensitivity<=100?value.shelfShakeSensitivity:50};}
export function useShelfDesignSettings(){
 const [settings,setSettings]=useState(DEFAULT_SHELF_DESIGN);
 useEffect(()=>{
  let disposed=false;
  const update=(next:ShelfDesignSettings)=>{if(!disposed)setSettings(previous=>JSON.stringify(previous)===JSON.stringify(next)?previous:next);};
  const load=()=>{if(document.hidden)return;void fetch('/api/auth/site-settings',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject()).then(value=>update(normalize(value))).catch(()=>undefined);};
  const changed=(event:Event)=>update((event as CustomEvent<ShelfDesignSettings>).detail);
  load();const timer=setInterval(load,15000);window.addEventListener('focus',load);window.addEventListener(eventName,changed);
  return()=>{disposed=true;clearInterval(timer);window.removeEventListener('focus',load);window.removeEventListener(eventName,changed);};
 },[]);
 return settings;
}
export async function saveShelfDesignSettings(patch:Partial<ShelfDesignSettings>){
 const input={...(patch.waveEnabled!==undefined?{shelfWaveEnabled:patch.waveEnabled}:{}),...(patch.spinEnabled!==undefined?{shelfSpinEnabled:patch.spinEnabled}:{}),...(patch.shuffleEnabled!==undefined?{shelfShuffleEnabled:patch.shuffleEnabled}:{}),...(patch.shakeSensitivity!==undefined?{shelfShakeSensitivity:patch.shakeSensitivity}:{})};
 const response=await fetch('/api/auth/settings',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
 if(!response.ok)throw new Error('Unable to save website design settings');
 const settings=normalize(await response.json());window.dispatchEvent(new CustomEvent(eventName,{detail:settings}));return settings;
}
