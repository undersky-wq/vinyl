'use client';
import {useRef,useState} from 'react';
import {Waves,Rotate3D,Shuffle} from 'lucide-react';
import {useShelfDesignSettings,saveShelfDesignSettings,type ShelfDesignSettings as Settings} from '../lib/shelf-design-settings';
import {ProfileToggle} from './profile-toggle';
export function ShelfDesignSettings({ru}:{ru:boolean}){
 const settings=useShelfDesignSettings();const [saving,setSaving]=useState<keyof Settings|null>(null),[message,setMessage]=useState('');
 const [draftSensitivity,setDraftSensitivity]=useState<number|null>(null);
 const savingRef=useRef(false);
 const sensitivity=draftSensitivity??settings.shakeSensitivity;
 const options=[{key:'waveEnabled' as const,label:ru?'Волна обложек':'Cover wave',description:ru?'Плавное движение в Shelf и Стопке, в том числе при раскрытом релизе.':'Floating wave in Shelf and Stack, including opened releases.',Icon:Waves},{key:'spinEnabled' as const,label:ru?'Захват и вращение':'Grab and rotate',description:ru?'Вращение обложки мышью во всех режимах.':'Mouse rotation in every collection layout.',Icon:Rotate3D},{key:'shuffleEnabled' as const,label:ru?'Перемешивание':'Shuffle',description:ru?'Пересборка коллекции с анимацией разлёта.':'Reorder the collection with the burst animation.',Icon:Shuffle}];
 async function toggle(key:Exclude<keyof Settings,'shakeSensitivity'>){if(savingRef.current)return;savingRef.current=true;setSaving(key);setMessage('');try{await saveShelfDesignSettings({[key]:!settings[key]});setMessage(ru?'Настройки сайта сохранены.':'Website settings saved.');}catch{setMessage(ru?'Не удалось сохранить настройку.':'Unable to save setting.');}finally{savingRef.current=false;setSaving(null);}}
 async function saveSensitivity(value:number){
  if(savingRef.current)return;
  if(value===settings.shakeSensitivity){setDraftSensitivity(null);return;}
  savingRef.current=true;setSaving('shakeSensitivity');setMessage('');
  try{await saveShelfDesignSettings({shakeSensitivity:value});setMessage(ru?'Настройки сайта сохранены.':'Website settings saved.');}
  catch{setMessage(ru?'Не удалось сохранить чувствительность.':'Unable to save sensitivity.');}
  finally{setDraftSensitivity(null);savingRef.current=false;setSaving(null);}
 }
 return <div className="admin-motion-settings">
  {options.map(({key,label,description,Icon})=><div key={key} className="admin-setting-row"><Icon size={21}/><div><strong>{label}</strong><p>{description}</p></div><ProfileToggle checked={settings[key]} label={label} disabled={saving!==null} onChange={()=>void toggle(key)}/></div>)}
  <div className="admin-shake-sensitivity">
   <div className="admin-shake-sensitivity__heading"><label htmlFor="shelf-shake-sensitivity">{ru?'Чувствительность встряхивания':'Shake sensitivity'}</label><output htmlFor="shelf-shake-sensitivity">{sensitivity}%</output></div>
   <p id="shelf-shake-sensitivity-hint">{ru?'Чем выше значение, тем легче встряхнуть. Настройка действует для всех посетителей сайта.':'Higher values need a lighter shake. Applies to all website visitors.'}</p>
   <input id="shelf-shake-sensitivity" aria-describedby="shelf-shake-sensitivity-hint" type="range" min={0} max={100} step={5} value={sensitivity} disabled={!settings.shuffleEnabled||saving!==null}
    onChange={event=>setDraftSensitivity(Number(event.currentTarget.value))}
    onPointerUp={event=>void saveSensitivity(Number(event.currentTarget.value))}
    onKeyUp={event=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key))void saveSensitivity(Number(event.currentTarget.value));}}
    onBlur={event=>void saveSensitivity(Number(event.currentTarget.value))}/>
   <div className="admin-shake-sensitivity__ends"><span>{ru?'Сильнее встряхнуть':'Stronger shake'}</span><span>{ru?'Легче встряхнуть':'Lighter shake'}</span></div>
  </div>
  {message&&<p role="status" className="muted">{message}</p>}
 </div>;
}
