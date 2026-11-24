import type { CSSProperties } from 'react'

export type IconName = 'chevron' | 'upload' | 'download' | 'image' | 'media' | 'archive' | 'shield' | 'check' | 'close' | 'menu' | 'arrow' | 'file' | 'error' | 'clock' | 'spark' | 'search' | 'arrow-left' | 'settings'
const paths: Record<IconName, string> = {
  settings: 'M10 2h4l.5 3 2 1.2 2.8-1.1 2 3.5-2.3 1.9v3l2.3 1.9-2 3.5-2.8-1.1-2 1.2-.5 3h-4l-.5-3-2-1.2-2.8 1.1-2-3.5L5 13.5v-3L2.7 8.6l2-3.5 2.8 1.1 2-1.2zM15.5 12a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0',
  search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0', 'arrow-left': 'M20 12H4m6-6-6 6 6 6',
  chevron: 'm6 9 6 6 6-6', upload: 'M12 16V4m-5 5 5-5 5 5M4 16v4h16v-4',
  download: 'M12 4v12m-5-5 5 5 5-5M4 17v3h16v-3', image: 'M3 4h18v16H3zM3 16l5-5 4 4 3-3 6 6M16 8h.01',
  media: 'M5 3h14v18H5zM10 8l6 4-6 4z', archive: 'M4 4h16v17H4zM10 4v3h4v3h-4v3h4v4h-4',
  shield: 'M12 3 4 6v6c0 4 4 7 8 9 4-2 8-5 8-9V6zM8 12l3 3 5-6',
  check: 'm5 12 4 4L19 6', close: 'm6 6 12 12M6 18 18 6', menu: 'M4 6h16M4 12h16M4 18h16',
  arrow: 'M4 12h16m-6-6 6 6-6 6', file: 'M5 3h9l5 5v13H5zM14 3v6h5M8 13h8M8 17h5',
  error: 'M12 3 2 21h20zM12 9v5M12 17h.01', clock: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  spark: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z',
}
export default function Icon({ name, className = '', style }: { name: IconName; className?: string; style?: CSSProperties }) {
  return <svg className={`uiIcon ${className}`} style={style} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[name]} /></svg>
}
