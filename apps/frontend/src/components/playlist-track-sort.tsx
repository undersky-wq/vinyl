import { ArrowDown,ArrowUp } from 'lucide-react';
import { cycleTrackSort,type TrackSort } from '../lib/harmonic-key';
import { HarmonicKeyFilter } from './harmonic-key-filter';

export function PlaylistTrackSort({sort,onChange,ru,selectedKeys,onKeysChange,keyValues}:{sort:TrackSort;onChange:(sort:TrackSort)=>void;ru:boolean;selectedKeys:readonly number[];onKeysChange:(keys:number[])=>void;keyValues:(string|null|undefined)[]}) {
  return <div className="paper-playlist-sort" role="group" aria-label={ru?'Сортировка треков':'Track sorting'}>
    <div className="paper-playlist-sort-leading"/>
    {(['bpm','key'] as const).map(field=><button type="button" className="paper-playlist-sort-column" key={field} aria-pressed={sort?.field===field}
      data-site-tooltip={ru?'По убыванию, по возрастанию, без сортировки':'Descending, ascending, no sorting'}
      aria-label={field==='key'?(ru?'Сортировать по тональности':'Sort by key'):(ru?'Сортировать по BPM':'Sort by BPM')}
      onClick={()=>onChange(cycleTrackSort(sort,field))}><span className="paper-playlist-sort-arrow" aria-hidden="true"><ArrowUp size={14} className={sort?.field===field&&sort.direction==='asc'?'is-active':undefined}/><ArrowDown size={14} className={sort?.field===field&&sort.direction==='desc'?'is-active':undefined}/></span></button>)}
    <span className="paper-playlist-sort-actions" aria-hidden="true"/><div className="paper-playlist-sort-duration"><HarmonicKeyFilter selected={selectedKeys} onChange={onKeysChange} values={keyValues} ru={ru}/></div>
  </div>;
}
