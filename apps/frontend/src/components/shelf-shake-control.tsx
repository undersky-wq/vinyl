'use client';
import { useEffect, useRef, useState } from 'react';
import { Shuffle, Smartphone } from 'lucide-react';
import { ShelfShakeDetector } from '../lib/shelf-shake';

export function ShelfShakeControl({onShuffle,ru,disabled=false}:{onShuffle:()=>void;ru:boolean;disabled?:boolean}) {
  const callback=useRef(onShuffle);callback.current=onShuffle;
  const [enabled,setEnabled]=useState(false),[status,setStatus]=useState('');
  const localControls=process.env.NODE_ENV!=='production';
  useEffect(()=>{if(!localControls&&window.isSecureContext&&window.DeviceMotionEvent&&!(window.DeviceMotionEvent as typeof DeviceMotionEvent&{requestPermission?:unknown}).requestPermission)setEnabled(true);},[localControls]);
  useEffect(()=>{
    if(!enabled)return;
    const detector=new ShelfShakeDetector();
    const motion=(event:DeviceMotionEvent)=>{
      if(document.hidden)return;
      const a=event.accelerationIncludingGravity;
      if(a?.x==null||a.y==null||a.z==null)return;
      if(detector.sample(a.x,a.y,a.z,performance.now()))callback.current();
    };
    window.addEventListener('devicemotion',motion);
    return()=>window.removeEventListener('devicemotion',motion);
  },[enabled]);
  async function toggle(){
    if(enabled){setEnabled(false);setStatus('');return;}
    if(!window.isSecureContext){setStatus(ru?'Для встряхивания открой сайт по HTTPS. Кнопка перемешивания работает и здесь.':'Shake needs HTTPS. You can still use Shuffle.');return;}
    const Motion=window.DeviceMotionEvent as typeof DeviceMotionEvent & {requestPermission?:()=>Promise<string>};
    if(!Motion){setStatus(ru?'Браузер не поддерживает датчик движения.':'Motion sensor is unavailable.');return;}
    try{
      if(Motion.requestPermission&&(await Motion.requestPermission())!=='granted'){setStatus(ru?'Доступ к движению не разрешён.':'Motion permission was not granted.');return;}
      setEnabled(true);setStatus(ru?'Встряхивание включено':'Shake enabled');
    }catch{setStatus(ru?'Не удалось включить датчик движения.':'Unable to enable the motion sensor.');}
  }
  if(!localControls)return null;
  return <div className="shelf-shake-control">
    <button type="button" onClick={onShuffle} disabled={disabled} aria-label={ru?'Перемешать коллекцию':'Shuffle collection'}><Shuffle size={16}/><span>{disabled?(ru?'Перемешиваю…':'Shuffling…'):(ru?'Перемешать':'Shuffle')}</span></button>
    <button type="button" onClick={()=>void toggle()} aria-pressed={enabled} aria-label={ru?'Включить встряхивание':'Enable shake'} title={ru?'Встряхивание':'Shake'}><Smartphone size={17}/></button>
    {status&&<output role="status">{status}</output>}
  </div>;
}
