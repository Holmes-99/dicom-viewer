import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Slider } from 'radix-ui'
import { ArrowDownUp, ChevronDown, CircleX, Link2, LoaderCircle, Pause, Play, Repeat } from 'lucide-react'
import { Menu, Tip, type MenuEntry } from './overlays'
import { cx } from './controls'

/* ---------- ToolButton ---------- */
export function ToolButton({
  icon, label, shortcut, active, disabled, menu, onClick,
}: { icon: ReactNode; label: string; shortcut?: string; active?: boolean; disabled?: boolean; menu?: MenuEntry[]; onClick?: () => void }) {
  const base = 'grid place-items-center text-fg transition-colors duration-[var(--motion-fast)] disabled:text-disabled disabled:pointer-events-none'
  const tone = active ? 'bg-accent-strong text-on-accent' : 'hover:bg-surface-hover'
  return (
    <div className="flex" data-tool>
      <Tip label={label} shortcut={shortcut}>
        <button
          aria-label={label}
          aria-pressed={active ?? undefined}
          disabled={disabled}
          onClick={onClick}
          className={cx(base, tone, 'h-9 w-9', menu ? 'rounded-l-md' : 'rounded-md')}
        >
          {icon}
        </button>
      </Tip>
      {menu && (
        <Menu
          items={menu}
          trigger={
            <button aria-label={`${label} options`} aria-haspopup="menu" disabled={disabled} className={cx(base, tone, 'h-9 w-3.5 rounded-r-md')}>
              <ChevronDown size={12} />
            </button>
          }
        />
      )}
    </div>
  )
}

/* ---------- Toolbar with roving focus ---------- */
export function Toolbar({ children, label = 'Viewer tools' }: { children: ReactNode; label?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    const btns = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
    const i = btns.indexOf(document.activeElement as HTMLButtonElement)
    if (i < 0) return
    e.preventDefault()
    btns[(i + (e.key === 'ArrowRight' ? 1 : -1) + btns.length) % btns.length]?.focus()
  }
  return (
    <div ref={ref} role="toolbar" aria-label={label} onKeyDown={onKey} className="flex h-11 items-center gap-0.5 border-b border-border bg-surface px-1.5">
      {children}
    </div>
  )
}
export const ToolSep = () => <div role="separator" aria-orientation="vertical" className="mx-1 h-6 w-px bg-border" />

/* ---------- Synthetic phantom (no real patient data, no original assets) ---------- */
export function Phantom({ seed = 0, className }: { seed?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const s = 256
    c.width = s; c.height = s
    const g = c.getContext('2d')!
    g.fillStyle = '#000'; g.fillRect(0, 0, s, s)
    const ell = (x: number, y: number, rx: number, ry: number, v: number) => {
      g.fillStyle = `rgb(${v},${v},${v})`; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill()
    }
    const k = (seed % 7) * 2
    ell(128, 132, 104, 88, 70)          // body
    ell(128, 132, 96, 80, 110)          // soft tissue
    ell(92, 120, 28 - k / 2, 38, 25)    // lung L
    ell(164, 120, 28 - k / 2, 38, 25)   // lung R
    ell(128, 196, 14, 12, 235)          // vertebra
    ell(138, 140, 18, 16, 160)          // heart
    ell(150 + k, 112, 5, 5, 150)        // lesion
    const img = g.getImageData(0, 0, s, s)
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 14
      img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n
    }
    g.putImageData(img, 0, 0)
  }, [seed])
  return <canvas ref={ref} aria-hidden className={cx('h-full w-full object-contain [image-rendering:auto]', className)} />
}

/* ---------- SeriesThumbnail ---------- */
export type ThumbState = 'loading' | 'ready' | 'failed'
export function SeriesThumbnail({
  number, modality, count, description, state = 'ready', selected, panelIndex, seed = 0, onOpen,
}: { number: number; modality: string; count: number; description: string; state?: ThumbState; selected?: boolean; panelIndex?: number; seed?: number; onOpen?: () => void }) {
  return (
    <div
      role="option"
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      onDoubleClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen?.()}
      className={cx('flex w-24 flex-col gap-1 rounded-md p-0.5 outline-offset-0', selected ? 'outline-2 outline-accent' : 'hover:bg-surface-hover')}
    >
      <div className="relative size-[92px] overflow-hidden rounded-sm bg-viewport">
        {state === 'loading' && <div className="absolute inset-0 animate-pulse bg-surface-hover/40" />}
        {state === 'ready' && <Phantom seed={seed} />}
        {state === 'failed' && (
          <div className="absolute inset-0 grid place-items-center p-1 text-center text-2xs text-danger">
            <span className="flex flex-col items-center gap-1"><CircleX size={16} />Can't read this series</span>
          </div>
        )}
        <span className="absolute left-1 top-1 rounded-sm bg-black/70 px-1 font-mono text-2xs text-overlay-text">{number} · {modality}</span>
        <span className="absolute bottom-1 right-1 rounded-sm bg-black/70 px-1 font-mono text-2xs text-overlay-muted">{count}</span>
        {panelIndex !== undefined && (
          <span aria-label={`Shown in panel ${panelIndex}`} className="absolute bottom-1 left-1 grid size-4 place-items-center rounded-full bg-accent-strong text-2xs font-semibold text-on-accent">{panelIndex}</span>
        )}
      </div>
      <p className="line-clamp-2 px-0.5 text-2xs text-muted">{description}</p>
    </div>
  )
}

/* ---------- Viewport ---------- */
export type ViewportState = 'empty' | 'loading' | 'rendered' | 'error'
export function Viewport({
  state, active, synced, hidePatient, uncalibrated, loadingPct = 0, seed = 0, errorText, showMeasurements = true,
}: { state: ViewportState; active?: boolean; synced?: boolean; hidePatient?: boolean; uncalibrated?: boolean; loadingPct?: number; seed?: number; errorText?: string; showMeasurements?: boolean }) {
  const corner = 'absolute flex flex-col text-xs leading-4 text-overlay-text [text-shadow:0_0_2px_#000,0_1px_1px_#000] font-sans tabular-nums'
  return (
    <div
      tabIndex={0}
      role="img"
      aria-label={state === 'rendered' ? 'CT chest, slice 112 of 240' : `Panel ${state}`}
      className={cx('relative h-full w-full overflow-hidden bg-viewport outline-1 -outline-offset-1', active ? 'outline outline-accent' : 'outline-transparent')}
    >
      {state === 'empty' && <p className="absolute inset-0 grid place-items-center text-sm text-overlay-muted">Drop a series here</p>}
      {state === 'loading' && (
        <div className="absolute inset-0 grid place-items-center text-sm text-overlay-muted">
          <span className="flex items-center gap-2"><LoaderCircle size={16} className="animate-spin" />Loading {loadingPct}%</span>
        </div>
      )}
      {state === 'error' && <p role="alert" className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-danger">{errorText ?? 'This image could not be decoded.'}</p>}
      {state === 'rendered' && (
        <>
          <div className="absolute inset-0 grid place-items-center"><div className="aspect-square h-full max-w-full"><Phantom seed={seed} /></div></div>
          {showMeasurements && (
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden>
              <g stroke="#000" strokeWidth="1.1" fill="none" opacity=".8">
                <line x1="30" y1="62" x2="52" y2="58" /><ellipse cx="60" cy="44" rx="5" ry="4" />
              </g>
              <g stroke="var(--annotation)" strokeWidth=".55" fill="none">
                <line x1="30" y1="62" x2="52" y2="58" />
                <rect x="29.2" y="61.2" width="1.6" height="1.6" fill="var(--annotation)" />
                <rect x="51.2" y="57.2" width="1.6" height="1.6" fill="var(--annotation)" />
              </g>
              <ellipse cx="60" cy="44" rx="5" ry="4" stroke="var(--annotation-active)" strokeWidth=".55" fill="none" />
              <line x1="0" y1="72" x2="100" y2="72" stroke="var(--refline)" strokeWidth=".35" strokeDasharray="2 1" />
            </svg>
          )}
          {showMeasurements && (
            <>
              <span className="absolute left-[31%] top-[64%] rounded-sm bg-black/60 px-1 text-xs text-overlay-text">
                42.6 mm{uncalibrated && <em className="ml-1 not-italic text-warning">uncalibrated</em>}
              </span>
              <span className="absolute left-[66%] top-[36%] rounded-sm bg-black/60 px-1 text-xs leading-4 text-overlay-text">
                Mean 38 HU · SD 11<br />Min −4 · Max 71<br />Area 1.9 cm²
              </span>
            </>
          )}
          <div className={cx(corner, 'left-1.5 top-1')}>
            {hidePatient ? <span className="text-overlay-muted">Patient data hidden</span> : (<><span>DOE^JANE</span><span>ID 0004821 · F · 1968-03-02</span></>)}
          </div>
          <div className={cx(corner, 'right-1.5 top-1 items-end')}><span>CT Chest w/o contrast</span><span>2026-11-02 09:14</span><span>Se 3 · Axial 1.25 mm</span></div>
          <div className={cx(corner, 'bottom-1 left-1.5')}><span>W 1500 L −600</span><span>Zoom 142%</span></div>
          <div className={cx(corner, 'bottom-1 right-1.5 items-end')}><span>Im 112 / 240</span><span>Z −184.5 mm</span></div>
          <span className="absolute left-1/2 top-1 -translate-x-1/2 text-xs text-overlay-muted">A</span>
          <span className="absolute left-1 top-1/2 -translate-y-1/2 text-xs text-overlay-muted">R</span>
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-overlay-muted">L</span>
          <div aria-hidden className="absolute right-0.5 top-6 bottom-6 w-1 rounded-sm bg-white/10"><div className="absolute left-0 right-0 top-[46%] h-3 rounded-sm bg-white/50" /></div>
          {synced && <span title="Synchronized" className="absolute right-4 top-14 text-sync"><Link2 size={14} /></span>}
        </>
      )}
    </div>
  )
}

/* ---------- LayoutPicker ---------- */
export function LayoutPicker({ value, onChange }: { value: [number, number]; onChange: (v: [number, number]) => void }) {
  const [hover, setHover] = useState<[number, number]>(value)
  const move = (e: KeyboardEvent) => {
    const [r, c] = hover
    const map: Record<string, [number, number]> = { ArrowUp: [r - 1, c], ArrowDown: [r + 1, c], ArrowLeft: [r, c - 1], ArrowRight: [r, c + 1] }
    if (map[e.key]) { e.preventDefault(); const [nr, nc] = map[e.key]; setHover([Math.min(5, Math.max(1, nr)), Math.min(5, Math.max(1, nc))]) }
    if (e.key === 'Enter') onChange(hover)
  }
  return (
    <div className="inline-flex flex-col items-center gap-2 rounded-md bg-surface-raised p-2 shadow-pop">
      <div role="grid" aria-label="Panel layout" tabIndex={0} onKeyDown={move} onMouseLeave={() => setHover(value)} className="grid grid-cols-5 gap-0.5">
        {Array.from({ length: 25 }, (_, i) => {
          const r = Math.floor(i / 5) + 1, c = (i % 5) + 1
          const on = r <= hover[0] && c <= hover[1]
          const cur = r <= value[0] && c <= value[1]
          return (
            <div
              key={i}
              role="gridcell"
              onMouseEnter={() => setHover([r, c])}
              onClick={() => onChange([r, c])}
              className={cx('size-4 rounded-sm border', on ? 'border-accent bg-accent/40' : cur ? 'border-accent' : 'border-border bg-bg')}
            />
          )
        })}
      </div>
      <span className="font-mono text-xs text-muted">{hover[0]} × {hover[1]}</span>
    </div>
  )
}

/* ---------- CineControl ---------- */
export function CineControl() {
  const [playing, setPlaying] = useState(false)
  const [fps, setFps] = useState(15)
  const [loop, setLoop] = useState(true)
  return (
    <div className="flex items-center gap-2 rounded-md bg-surface-raised/95 px-2 py-1 shadow-pop">
      <button aria-label={playing ? 'Pause' : 'Play'} onClick={() => setPlaying(!playing)} className="grid size-7 place-items-center rounded-md hover:bg-surface-hover">
        {playing ? <Pause size={16} /> : <Play size={16} />}
      </button>
      <Slider.Root value={[fps]} min={1} max={60} step={1} onValueChange={([v]) => setFps(v)} className="relative flex h-5 w-32 items-center" aria-label="Frames per second">
        <Slider.Track className="relative h-1 flex-1 rounded-sm bg-bg"><Slider.Range className="absolute h-full rounded-sm bg-accent" /></Slider.Track>
        <Slider.Thumb aria-valuetext={`${fps} frames per second`} className="block size-3.5 rounded-full border-2 border-accent bg-fg" />
      </Slider.Root>
      <span className="w-12 font-mono text-xs tabular-nums text-muted">{fps} fps</span>
      <button aria-label={loop ? 'Loop (click for bounce)' : 'Bounce (click for loop)'} onClick={() => setLoop(!loop)} className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface-hover hover:text-fg">
        {loop ? <Repeat size={14} /> : <ArrowDownUp size={14} />}
      </button>
    </div>
  )
}
