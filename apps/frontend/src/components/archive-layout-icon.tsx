import type { ArchiveLayout } from './archive-page-header';

export function ArchiveLayoutIcon({layout}: {layout:ArchiveLayout}) {
  return <svg className="archive-layout-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {layout === 'shelf' ? <>
      <path d="M14 6V2l8 4v12l-4-2"/><path d="M10 8V4l8 4v12l-4-2"/><path d="M6 10V6l8 4v12l-4-2"/><path d="m2 8 8 4v11l-8-4Z"/>
    </> : layout === 'stack' ? <>
      <path d="m7 5-1-4h12l-1 4"/><path d="m6.5 9-1-4h13l-1 4"/><path d="m6 14-1-5h14l-1 5"/><path d="M4 14h16l-2 9H6Z"/>
    </> : layout === 'grid' ? <>
      <rect x="2" y="2" width="8" height="8"/><rect x="14" y="2" width="8" height="8"/><rect x="2" y="14" width="8" height="8"/><rect x="14" y="14" width="8" height="8"/>
    </> : <>
      <rect x="2" y="2" width="8" height="8"/><path d="M13 3h9M13 6h7M13 9h8"/><rect x="2" y="14" width="8" height="8"/><path d="M13 15h8M13 18h9M13 21h6"/>
    </>}
  </svg>;
}
