import { useEffect, useRef, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { ToolGroupManager } from '@cornerstonejs/tools'
import type { Types } from '@cornerstonejs/core'
import { engine, Events, stackViewport, TOOLGROUP_ID, ViewportType } from './engine'
import { toWL } from './actions'
import type { Patient, Series, Study } from '../data/types'
import { cx } from '../ui/controls'
import { fmtDate, fmtName, fmtTime } from './format'

type Overlay = { index: number; total: number; ww: number; wc: number; zoom: number; z: number | null }

export function StackPanel({
  viewportId, series, patient, study, active, hidePatient, showOverlay, onActivate, onDropSeries,
}: {
  viewportId: string; series: Series | null; patient: Patient | null; study: Study | null
  active: boolean; hidePatient: boolean; showOverlay: boolean
  onActivate: () => void; onDropSeries: (seriesUid: string) => void
}) {
  const el = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'empty' | 'loading' | 'rendered' | 'error'>('empty')
  const [err, setErr] = useState('')
  const [ov, setOv] = useState<Overlay | null>(null)
  const [dragOver, setDragOver] = useState(false)

  // enable the panel once
  useEffect(() => {
    const node = el.current!
    const re = engine()!
    re.enableElement({ viewportId, type: ViewportType.STACK, element: node, defaultOptions: { background: [0, 0, 0] as Types.Point3 } })
    ToolGroupManager.getToolGroup(TOOLGROUP_ID)?.addViewport(viewportId, re.id)
    // refit on size change (layout switch, window resize). VERIFY: does the original keep zoom on resize?
    let raf = 0
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        engine()?.resize(true, false)
      })
    })
    ro.observe(node)
    const stop = (e: Event) => e.preventDefault()
    node.addEventListener('contextmenu', stop)
    return () => {
      ro.disconnect()
      node.removeEventListener('contextmenu', stop)
      ToolGroupManager.getToolGroup(TOOLGROUP_ID)?.removeViewports(re.id, viewportId)
      re.disableElement(viewportId)
    }
  }, [viewportId])

  // load the series
  useEffect(() => {
    let cancelled = false
    const v = stackViewport(viewportId)
    if (!v) return
    if (!series) { setState('empty'); setOv(null); return }
    setState('loading')
    v.setStack(series.imageIds, 0)
      .then(() => { if (!cancelled) { v.render(); setState('rendered') } })
      .catch((e: unknown) => {
        if (cancelled) return
        console.error('[viewer] could not show series', series.seriesUid, e)
        setState('error')
        setErr(/transfer syntax|codec|decode/i.test(String(e)) ? 'This image uses a compression the viewer cannot decode yet.' : 'This series could not be displayed. The files may be damaged.')
      })
    return () => { cancelled = true }
  }, [viewportId, series])

  // overlay readouts
  useEffect(() => {
    const node = el.current!
    const update = () => {
      const v = stackViewport(viewportId)
      if (!v || !series) return
      const range = v.getProperties().voiRange
      const wl = range ? toWL(range) : { windowWidth: 0, windowCenter: 0 }
      const index = v.getCurrentImageIdIndex()
      const inst = series.instances[Math.min(index, series.instances.length - 1)]
      setOv({
        index: index + 1, total: series.imageIds.length,
        ww: Math.round(wl.windowWidth), wc: Math.round(wl.windowCenter),
        zoom: Math.round((v.getZoom() || 1) * 100),
        z: inst?.position ? inst.position[2] : null,
      })
    }
    const evs = [Events.IMAGE_RENDERED, Events.VOI_MODIFIED, Events.CAMERA_MODIFIED, Events.STACK_NEW_IMAGE]
    evs.forEach((e) => node.addEventListener(e, update))
    return () => evs.forEach((e) => node.removeEventListener(e, update))
  }, [viewportId, series])

  const corner = 'pointer-events-none absolute flex flex-col text-xs leading-4 text-overlay-text tabular-nums [text-shadow:0_0_2px_#000,0_1px_1px_#000]'
  return (
    <div
      className={cx('relative h-full w-full min-h-0 min-w-0 overflow-hidden bg-viewport outline-1 -outline-offset-1', active ? 'outline outline-accent' : 'outline-transparent', dragOver && 'outline-2 outline-dashed outline-accent')}
      onMouseDownCapture={onActivate}
      onFocus={onActivate}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('application/x-series')) { e.preventDefault(); setDragOver(true) } }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { setDragOver(false); const uid = e.dataTransfer.getData('application/x-series'); if (uid) { e.preventDefault(); e.stopPropagation(); onDropSeries(uid) } }}
    >
      <div
        ref={el}
        tabIndex={0}
        role="img"
        aria-label={series ? `${series.description || series.modality}, image ${ov?.index ?? 1} of ${series.imageIds.length}` : 'Empty panel'}
        className="absolute inset-0 focus-visible:outline-none"
      />
      {state === 'empty' && <p className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-overlay-muted">Drop a series here</p>}
      {state === 'loading' && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-overlay-muted">
          <span className="flex items-center gap-2"><LoaderCircle size={16} className="animate-spin" />Loading…</span>
        </div>
      )}
      {state === 'error' && <p role="alert" className="pointer-events-none absolute inset-0 grid place-items-center px-6 text-center text-sm text-danger">{err}</p>}
      {state === 'rendered' && showOverlay && ov && (
        <>
          <div className={cx(corner, 'left-1.5 top-1')}>
            {hidePatient || !patient ? <span className="text-overlay-muted">Patient data hidden</span> : (
              <>
                <span>{fmtName(patient.name) || 'Unnamed'}</span>
                <span>{[patient.id && `ID ${patient.id}`, patient.sex, fmtDate(patient.birthDate)].filter(Boolean).join(' · ')}</span>
              </>
            )}
          </div>
          <div className={cx(corner, 'right-1.5 top-1 items-end text-right')}>
            <span>{study?.description}</span>
            <span>{[fmtDate(study?.date ?? ''), fmtTime(study?.time ?? '')].filter(Boolean).join(' ')}</span>
            <span>{[series?.number != null && `Se ${series.number}`, series?.description].filter(Boolean).join(' · ')}</span>
          </div>
          <div className={cx(corner, 'bottom-1 left-1.5')}>
            <span>W {ov.ww} L {ov.wc}</span>
            <span>Zoom {ov.zoom}%</span>
          </div>
          <div className={cx(corner, 'bottom-1 right-1.5 items-end')}>
            <span>Im {ov.index} / {ov.total}</span>
            {ov.z !== null && <span>Z {ov.z.toFixed(1)} mm</span>}
          </div>
        </>
      )}
    </div>
  )
}
