import { useEffect, useRef, useState } from 'react'
import { CircleX } from 'lucide-react'
import { drawThumbnail } from './thumbnail'
import type { Series } from '../data/types'
import { cx } from '../ui/controls'

/** Series thumbnail rendered from the middle image of the real series. */
export function SeriesThumb({ series, selected, panelIndex, onOpen, onSelect }: {
  series: Series; selected: boolean; panelIndex?: number; onOpen: () => void; onSelect: () => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')

  useEffect(() => {
    let alive = true
    const imageId = series.imageIds[Math.floor(series.imageIds.length / 2)]
    if (!imageId || !canvas.current) { setState('failed'); return }
    const cv = canvas.current
    drawThumbnail(cv, imageId)
      .then(() => { if (alive) setState('ready') })
      .catch((e) => { console.warn('[viewer] thumbnail failed', imageId, e); if (alive) setState('failed') })
    return () => { alive = false }
  }, [series])

  return (
    <div
      role="option"
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      draggable
      onDragStart={(e) => { e.dataTransfer.setData('application/x-series', series.seriesUid); e.dataTransfer.effectAllowed = 'copy' }}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen() }}
      title={series.description}
      className={cx('flex w-24 shrink-0 cursor-default flex-col gap-1 rounded-md p-0.5', selected ? 'outline-2 outline-accent' : 'hover:bg-surface-hover')}
    >
      <div className="relative size-[92px] overflow-hidden rounded-sm bg-viewport">
        <canvas ref={canvas} aria-hidden className={cx('h-full w-full', state !== 'ready' && 'invisible')} />
        {state === 'loading' && <div className="absolute inset-0 animate-pulse bg-surface-hover/40" />}
        {state === 'failed' && (
          <div className="absolute inset-0 grid place-items-center p-1 text-center text-2xs text-danger">
            <span className="flex flex-col items-center gap-1"><CircleX size={16} />No preview</span>
          </div>
        )}
        <span className="absolute left-1 top-1 rounded-sm bg-black/70 px-1 font-mono text-2xs text-overlay-text">{series.number ?? '–'} · {series.modality || '?'}</span>
        <span className="absolute bottom-1 right-1 rounded-sm bg-black/70 px-1 font-mono text-2xs text-overlay-muted">{series.imageIds.length}</span>
        {panelIndex !== undefined && (
          <span aria-label={`Shown in panel ${panelIndex}`} className="absolute bottom-1 left-1 grid size-4 place-items-center rounded-full bg-accent-strong text-2xs font-semibold text-on-accent">{panelIndex}</span>
        )}
      </div>
      <p className="line-clamp-2 break-words px-0.5 text-2xs text-muted">{series.description || 'No description'}</p>
    </div>
  )
}
