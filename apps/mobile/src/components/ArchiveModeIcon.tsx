import Svg, { Path, Rect } from 'react-native-svg';
import type { ArchiveMode } from '../lib/archive-geometry';
export function ArchiveModeIcon({ mode, color }: { mode: ArchiveMode; color: string }) {
  return <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
    {mode === 'shelf' ? <>
      <Path d="M14 6V2l8 4v12l-4-2"/><Path d="M10 8V4l8 4v12l-4-2"/><Path d="M6 10V6l8 4v12l-4-2"/><Path d="m2 8 8 4v11l-8-4Z"/>
    </> : mode === 'stack' ? <>
      <Path d="m7 5-1-4h12l-1 4"/><Path d="m6.5 9-1-4h13l-1 4"/><Path d="m6 14-1-5h14l-1 5"/><Path d="M4 14h16l-2 9H6Z"/>
    </> : mode === 'grid' ? <>
      <Rect x="2" y="2" width="8" height="8"/><Rect x="14" y="2" width="8" height="8"/><Rect x="2" y="14" width="8" height="8"/><Rect x="14" y="14" width="8" height="8"/>
    </> : <>
      <Rect x="2" y="2" width="8" height="8"/><Path d="M13 3h9M13 6h7M13 9h8"/><Rect x="2" y="14" width="8" height="8"/><Path d="M13 15h8M13 18h9M13 21h6"/>
    </>}
  </Svg>;
}
