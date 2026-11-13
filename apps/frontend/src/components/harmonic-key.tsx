import type { CSSProperties } from 'react';
import { parseHarmonicKey } from '../lib/harmonic-key';
import './harmonic-key.css';

export function HarmonicKey({ value,className='',tooltip }: {value?:string|null;className?:string;tooltip?:string}) {
  const key=parseHarmonicKey(value);
  return <span className={`${className}${key?' harmonic-key':''}`} data-harmonic-key={key?key.order:undefined} data-site-tooltip={tooltip}
    style={key?{'--harmonic-key-light':key.light,'--harmonic-key-dark':key.dark} as CSSProperties:undefined}>{value||'—'}</span>;
}
