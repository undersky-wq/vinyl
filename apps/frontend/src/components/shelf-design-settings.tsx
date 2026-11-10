'use client';
import {useState} from 'react';
import {Waves,Rotate3D,Shuffle} from 'lucide-react';
import {useShelfDesignSettings,saveShelfDesignSettings,type ShelfDesignSettings as Settings} from '../lib/shelf-design-settings';
export function ShelfDesignSettings({ru}:{ru:boolean}){
 const settings=useShelfDesignSettings();const [saving,setSaving]=useState<keyof Settings|null>(null),[message,setMessage]=useState('');
 const options=[{key:'waveEnabled' as const,label:ru?'Волна обложек':'Cover wave',description:ru?'Плавное движение в Shelf и Стопке, в том числе при раскрытом релизе.':'Floating wave in Shelf and Stack, including opened releases.',Icon:Waves},{key:'spinEnabled' as const,label:ru?'Захват и вращение':'Grab and rotate',description:ru?'Вращение обложки мышью во всех режимах.':'Mouse rotation in every collection layout.',Icon:Rotate3D},{key:'shuffleEnabled' as const,label:ru?'Перемешивание':'Shuffle',description:ru?'Пересборка коллекции с анимацией разлёта.':'Reorder the collection with the burst animation.',Icon:Shuffle}];
 async function toggle(key:keyof Settings){setSaving(key);setMessage('');try{await saveShelfDesignSettings({[key]:!settings[key]});setMessage(ru?'Настройки сайта сохранены.':'Website settings saved.');}catch{setMessage(ru?'Не удалось сохранить настройку.':'Unable to save setting.');}finally{setSaving(null);}}
 return <div className="admin-motion-settings">{options.map(({key,label,description,Icon})=><div key={key} className="admin-setting-row"><Icon size={21}/><div><strong>{label}</strong><p>{description}</p></div><button type="button" role="switch" aria-checked={settings[key]} aria-label={label} disabled={saving!==null} onClick={()=>void toggle(key)}><span>{settings[key]?'ON':'OFF'}</span></button></div>)}{message&&<p role="status" className="muted">{message}</p>}</div>;
}
