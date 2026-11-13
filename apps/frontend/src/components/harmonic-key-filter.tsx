import { useEffect,useId,useRef,useState,type CSSProperties } from 'react';
import { GripHorizontal,X } from 'lucide-react';
import { parseHarmonicKey } from '../lib/harmonic-key';
import './harmonic-key-filter.css';

const majors=['C','G','D','A','E','B','F#','Db','Ab','Eb','Bb','F'];
const minors=['Am','Em','Bm','F#m','C#m','G#m','D#m','Bbm','Fm','Cm','Gm','Dm'];
function point(radius:number,angle:number){const a=angle*Math.PI/180;return [160+radius*Math.sin(a),160-radius*Math.cos(a)];}
function wedge(inner:number,outer:number,index:number){const a=index*30-15,b=a+30,p=point(outer,a),q=point(outer,b),r=point(inner,b),s=point(inner,a);return `M ${p} A ${outer} ${outer} 0 0 1 ${q} L ${r} A ${inner} ${inner} 0 0 0 ${s} Z`;}

export function HarmonicKeyFilter({selected,onChange,values,ru}:{selected:readonly number[];onChange:(keys:number[])=>void;values:(string|null|undefined)[];ru:boolean}){
  const [open,setOpen]=useState(false),root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),id=useId();
  const [offset,setOffset]=useState({x:0,y:0});
  const drag=useRef<{pointerId:number;x:number;y:number;offset:{x:number;y:number};rect:DOMRect}|null>(null);
  useEffect(()=>{const reset=()=>setOffset({x:0,y:0});window.addEventListener('resize',reset);return()=>window.removeEventListener('resize',reset);},[]);
  useEffect(()=>{if(!open)return;function outside(e:PointerEvent){if(!root.current?.contains(e.target as Node))setOpen(false);}function escape(e:KeyboardEvent){if(e.key==='Escape'){setOpen(false);trigger.current?.focus();}}document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};},[open]);
  const counts=new Map<number,number>();for(const value of values){const key=parseHarmonicKey(value);if(key)counts.set(key.order,(counts.get(key.order)||0)+1);}
  const matching=selected.length?selected.reduce((sum,key)=>sum+(counts.get(key)||0),0):values.length;
  const toggle=(order:number)=>onChange(selected.includes(order)?selected.filter(key=>key!==order):[...selected,order]);
  return <div className="harmonic-filter" ref={root} onClick={e=>e.stopPropagation()}>
    <button type="button" ref={trigger} aria-label={ru?'Кварто-квинтовый круг':'Circle of fifths'} data-site-tooltip={ru?'Выбрать тональности':'Select keys'} aria-expanded={open} aria-controls={id} onClick={()=>{if(!open)setOffset({x:0,y:0});setOpen(!open);}} className={selected.length?'is-filtered':''}><svg className="harmonic-filter-icon" width="24" height="24" viewBox="0 0 320 320" aria-hidden="true">{[majors,minors].flatMap((notes,ring)=>notes.map((note,index)=><path key={note} d={wedge(ring?35:103,ring?100:154,index)} fill={parseHarmonicKey(note)!.dark}/>))}</svg>{selected.length>0&&<sup>{selected.length}</sup>}</button>
    <div id={id} className={`harmonic-filter-panel${open?' is-open':''}`} style={{translate:`${offset.x}px ${offset.y}px`}} onPointerDown={e=>e.stopPropagation()} inert={!open} aria-hidden={!open} role="group" aria-label={ru?'Фильтр тональностей':'Key filter'}>
      <div className="harmonic-filter-heading" onPointerDown={e=>{if(e.button!==0||(e.target as Element).closest('button'))return;e.preventDefault();const rect=e.currentTarget.parentElement!.getBoundingClientRect();drag.current={pointerId:e.pointerId,x:e.clientX,y:e.clientY,offset,rect};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{const d=drag.current;if(!d||d.pointerId!==e.pointerId)return;setOffset({x:d.offset.x+Math.max(8-d.rect.left,Math.min(window.innerWidth-8-d.rect.right,e.clientX-d.x)),y:d.offset.y+Math.max(8-d.rect.top,Math.min(window.innerHeight-8-Math.min(d.rect.bottom,d.rect.top+48),e.clientY-d.y))});}} onPointerUp={e=>{drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}} onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}}><strong>{ru?'Тональности':'Keys'}</strong><GripHorizontal size={16} aria-hidden="true"/><button type="button" aria-label={ru?'Закрыть':'Close'} onClick={()=>{setOpen(false);trigger.current?.focus();}}><X size={18}/></button></div>
      <p>{ru?'Выберите одну или несколько':'Select one or more'}</p>
      <svg viewBox="0 0 320 320" className="harmonic-filter-wheel" role="group" aria-label={ru?'Кварто-квинтовый круг':'Circle of fifths'}>
        {[majors,minors].flatMap((notes,ring)=>notes.map((note,index)=>{const key=parseHarmonicKey(note)!,active=selected.includes(key.order),[x,y]=point(ring?86:132,index*30),count=counts.get(key.order)||0;return <g key={note} style={{'--key-light':key.light,'--key-dark':key.dark} as CSSProperties} className={active?'is-selected':''}>
          <path d={wedge(ring?62:110,ring?108:154,index)} role="checkbox" tabIndex={open?0:-1} aria-checked={active} aria-label={`${note}: ${count}`} onClick={()=>toggle(key.order)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle(key.order);}}}/>
          <text x={x} y={y-2} textAnchor="middle" dominantBaseline="middle">{note}</text><text className="harmonic-filter-count" x={x} y={y+13} textAnchor="middle">{count}</text>
        </g>;}))}
        <text className="harmonic-filter-total" x="160" y="157" textAnchor="middle">{matching}</text><text className="harmonic-filter-caption" x="160" y="177" textAnchor="middle">{ru?'треков':'tracks'}</text>
      </svg>
      <button type="button" className="harmonic-filter-clear" disabled={!selected.length} onClick={()=>onChange([])}>{ru?'Все тональности':'All keys'}</button>
    </div>
  </div>;
}
