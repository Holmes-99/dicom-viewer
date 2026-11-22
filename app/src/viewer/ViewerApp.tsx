import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ArrowDownUp, Circle, CircleHelp, Columns2, Contrast, Copy, Cuboid, Disc, Download, Film, FolderOpen, Hand, Info, Layers,
  LayoutGrid, Link2, Printer, RotateCw, Ruler, Server, Square, SunMoon, Tags, Triangle, Undo2, ZoomIn, Database, Sparkles,
} from 'lucide-react'
import { ToolButton, ToolSep, Toolbar, LayoutPicker } from '../ui/viewer'
import { Button, Checkbox } from '../ui/controls'
import { Dialog, DialogClose, Progress, Toast, TooltipProvider, type MenuEntry } from '../ui/overlays'
import { DataTable, type Column } from '../ui/DataTable'
import { Popover } from 'radix-ui'
import { webSource, filesFromDrop } from '../data/webSource'
import { allSeries, findSeries, studyOf, type OpenProgress, type Series, type Session } from '../data/types'
import { initEngine, setActiveTool, type ToolId } from './engine'
import { CT_PRESETS, copyImage, flip, resetView, resetWindow, rotate, scrollBy, scrollTo, setWindow, toggleInvert } from './actions'
import { StackPanel } from './StackPanel'
import { SeriesThumb } from './SeriesThumb'
import { fmtDate } from './format'

const source = webSource
const MAX = 25
const vpId = (i: number) => `panel-${i}`
const I = 20
const NOTICE_KEY = 'viewer.notice.v1'

type ToastMsg = { tone: 'success' | 'warning' | 'danger'; title: string; body?: string }

export default function ViewerApp() {
  const [engineReady, setEngineReady] = useState(false)
  const [engineError, setEngineError] = useState('')
  const [session, setSession] = useState<Session | null>(null)
  const [progress, setProgress] = useState<OpenProgress | null>(null)
  const [layout, setLayout] = useState<[number, number]>([1, 1])
  const [panels, setPanels] = useState<(string | null)[]>(Array(MAX).fill(null))
  const [active, setActive] = useState(0)
  const [tool, setTool] = useState<ToolId>('wl')
  const [hidePatient, setHidePatient] = useState(false)
  const [showOverlay, setShowOverlay] = useState(true)
  const [seriesOpen, setSeriesOpen] = useState(false)
  const [selectedThumb, setSelectedThumb] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastMsg | null>(null)
  const [notice, setNotice] = useState(() => { try { return localStorage.getItem(NOTICE_KEY) !== '1' } catch { return true } })
  const [noticeAck, setNoticeAck] = useState(false)
  const [dropping, setDropping] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)
  const panelEls = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    initEngine().then(() => setEngineReady(true)).catch((e) => setEngineError(String(e)))
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])

  const count = layout[0] * layout[1]
  const series = useMemo(() => allSeries(session), [session])

  // ------------------------------------------------------------ opening
  const loadSession = useCallback((s: Session) => {
    const list = allSeries(s)
    if (!list.length) {
      setToast({ tone: 'danger', title: 'No images found', body: s.skipped.length ? `${s.skipped.length} files were not DICOM images.` : 'The selection was empty.' })
      return
    }
    // first panel: the series with the most images (VERIFY: which series the original shows first)
    const main = [...list].sort((a, b) => b.imageIds.length - a.imageIds.length)[0]
    const next = Array<string | null>(MAX).fill(null)
    next[0] = main.seriesUid
    let k = 1
    for (const se of list) if (se !== main && k < MAX) next[k++] = se.seriesUid
    setSession(s)
    setPanels(next)
    setActive(0)
    setSelectedThumb(main.seriesUid)
    if (s.skipped.length) setToast({ tone: 'warning', title: `${s.skipped.length} files skipped`, body: 'They are not DICOM images or are damaged.' })
  }, [])

  const open = useCallback(async (run: (p: (x: OpenProgress) => void) => Promise<Session>) => {
    setProgress({ done: 0, total: 1 })
    try {
      setSession(null)
      setPanels(Array(MAX).fill(null))
      source.closeAll()
      loadSession(await run(setProgress))
    } catch (e) {
      setToast({ tone: 'danger', title: 'Could not open the files', body: String(e) })
    } finally {
      setProgress(null)
    }
  }, [loadSession])

  const openFiles = (files: FileList | File[] | null) => { if (files && files.length) open((p) => source.openFiles([...files], p)) }
  const openDemo = () => open((p) => source.openDemo(p))

  // ------------------------------------------------------------ panel helpers
  const activeId = vpId(active)
  const showInActive = (uid: string) => setPanels((p) => { const n = [...p]; n[active] = uid; return n })
  const chooseTool = (t: ToolId) => { setTool(t); setActiveTool(t) }
  const changeLayout = (l: [number, number]) => { setLayout(l); if (active >= l[0] * l[1]) setActive(0) }

  const copy = async () => {
    const el = panelEls.current[active]
    if (el && (await copyImage(el).catch(() => false))) setToast({ tone: 'success', title: 'Image copied to the clipboard' })
  }

  // ------------------------------------------------------------ keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, select, [role=dialog], [role=menu]')) return
      const k = e.key
      const ctrl = e.ctrlKey || e.metaKey
      const run = (f: () => void) => { e.preventDefault(); f() }
      if (ctrl && k.toLowerCase() === 'o') return run(() => (e.shiftKey ? fileInput : folderInput).current?.click())
      if (ctrl && k.toLowerCase() === 'c') return run(copy)
      if (ctrl && k.toLowerCase() === 't') return run(() => setShowOverlay((v) => !v))
      if (ctrl && k.toLowerCase() === 'r') return run(() => rotate(activeId, 90))
      if (ctrl && k.toLowerCase() === 'h') return run(() => flip(activeId, 'h'))
      if (ctrl) return
      if (k === 'F4') return run(() => setSeriesOpen(true))
      if (!session) return
      if (k === 'ArrowUp' || k === 'ArrowLeft') return run(() => scrollBy(activeId, -1))
      if (k === 'ArrowDown' || k === 'ArrowRight') return run(() => scrollBy(activeId, 1))
      if (k === 'PageUp') return run(() => scrollBy(activeId, -10))
      if (k === 'PageDown') return run(() => scrollBy(activeId, 10))
      if (k === 'Home') return run(() => scrollTo(activeId, 'first'))
      if (k === 'End') return run(() => scrollTo(activeId, 'last'))
      if (k === 'Escape') return run(() => resetView(activeId))
      const toolKeys: Record<string, ToolId> = { b: 'scroll', w: 'wl', z: 'zoom', p: 'pan', l: 'length', a: 'angle', e: 'ellipse', r: 'rect' }
      if (toolKeys[k.toLowerCase()]) return run(() => chooseTool(toolKeys[k.toLowerCase()]))
      if (k.toLowerCase() === 'i') return run(() => toggleInvert(activeId))
      if (k === '1') return run(() => resetWindow(activeId))
      const preset = CT_PRESETS.find((p) => p.key === k)
      if (preset) return run(() => setWindow(activeId, preset.width, preset.center))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ------------------------------------------------------------ menus
  const openMenu: MenuEntry[] = [
    { label: 'Open folder…', shortcut: 'Ctrl+O', icon: <FolderOpen size={14} />, onSelect: () => folderInput.current?.click() },
    { label: 'Open files…', shortcut: 'Ctrl+Shift+O', onSelect: () => fileInput.current?.click() },
    { label: 'Open disc', icon: <Disc size={14} />, disabled: true },
    { label: 'Open ZIP archive…', disabled: true },
    { type: 'separator' },
    { label: 'Search PACS…', icon: <Server size={14} />, disabled: true },
    { label: 'Local archive…', icon: <Database size={14} />, disabled: true },
    { type: 'separator' },
    { label: 'Open demo study', icon: <Sparkles size={14} />, onSelect: openDemo },
  ]
  const wlMenu: MenuEntry[] = [
    { type: 'label', label: 'CT presets' },
    ...CT_PRESETS.map((p) => ({ label: p.label, shortcut: p.key, onSelect: () => setWindow(activeId, p.width, p.center) })),
    { type: 'separator' },
    { label: 'Default (from file)', shortcut: '1', onSelect: () => resetWindow(activeId) },
  ]
  const rotateMenu: MenuEntry[] = [
    { label: 'Rotate 90° right', shortcut: 'Ctrl+R', onSelect: () => rotate(activeId, 90) },
    { label: 'Rotate 90° left', onSelect: () => rotate(activeId, -90) },
    { label: 'Rotate 180°', onSelect: () => rotate(activeId, 180) },
    { type: 'separator' },
    { label: 'Flip horizontal', shortcut: 'Ctrl+H', onSelect: () => flip(activeId, 'h') },
    { label: 'Flip vertical', onSelect: () => flip(activeId, 'v') },
  ]
  const viewMenu: MenuEntry[] = [
    { type: 'check', label: 'Show overlay text', checked: showOverlay, shortcut: 'Ctrl+T', onChange: setShowOverlay },
    { type: 'check', label: 'Hide patient data', checked: hidePatient, onChange: setHidePatient },
    { type: 'separator' },
    { label: 'Copy image', shortcut: 'Ctrl+C', onSelect: copy },
  ]
  const t = (id: ToolId) => ({ active: !!session && tool === id, onClick: () => chooseTool(id), disabled: !session })
  const soon = (label: string, icon: ReactNode) => <ToolButton icon={icon} label={`${label} (coming soon)`} disabled />

  // ------------------------------------------------------------ render
  return (
    <TooltipProvider>
      <div
        className="flex h-full flex-col"
        onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDropping(true) } }}
        onDragLeave={(e) => { if (e.currentTarget === e.target) setDropping(false) }}
        onDrop={async (e) => { if (!e.dataTransfer.types.includes('Files')) return; e.preventDefault(); setDropping(false); openFiles(await filesFromDrop(e.dataTransfer)) }}
      >
        <input ref={fileInput} type="file" multiple hidden onChange={(e) => { openFiles(e.target.files); e.target.value = '' }} />
        <input ref={folderInput} type="file" multiple hidden {...{ webkitdirectory: '' }} onChange={(e) => { openFiles(e.target.files); e.target.value = '' }} />

        <Toolbar>
          <ToolButton icon={<FolderOpen size={I} />} label="Open folder" shortcut="Ctrl+O" onClick={() => folderInput.current?.click()} menu={openMenu} />
          <ToolSep />
          <Popover.Root>
            <Popover.Trigger asChild>
              <button aria-label="Layout" className="grid h-9 w-9 place-items-center rounded-md text-fg hover:bg-surface-hover disabled:text-disabled" disabled={!session}><LayoutGrid size={I} /></button>
            </Popover.Trigger>
            <Popover.Portal><Popover.Content sideOffset={4} className="z-50"><LayoutPicker value={layout} onChange={changeLayout} /></Popover.Content></Popover.Portal>
          </Popover.Root>
          <ToolButton icon={<Layers size={I} />} label="Series" shortcut="F4" onClick={() => setSeriesOpen(true)} disabled={!session} />
          <ToolSep />
          <ToolButton icon={<ArrowDownUp size={I} />} label="Scroll" shortcut="B" {...t('scroll')} />
          <ToolButton icon={<SunMoon size={I} />} label="Window / level" shortcut="W" {...t('wl')} menu={wlMenu} />
          <ToolButton icon={<ZoomIn size={I} />} label="Zoom" shortcut="Z" {...t('zoom')} />
          <ToolButton icon={<Hand size={I} />} label="Pan" shortcut="P" {...t('pan')} />
          <ToolSep />
          <ToolButton icon={<Ruler size={I} />} label="Length" shortcut="L" {...t('length')} />
          <ToolButton icon={<Triangle size={I} />} label={tool === 'cobb' ? 'Cobb angle' : 'Angle'} shortcut="A" {...t(tool === 'cobb' ? 'cobb' : 'angle')}
            active={!!session && (tool === 'angle' || tool === 'cobb')}
            menu={[{ label: 'Angle', onSelect: () => chooseTool('angle') }, { label: 'Cobb angle', onSelect: () => chooseTool('cobb') }]} />
          <ToolButton icon={<Circle size={I} />} label="Ellipse" shortcut="E" {...t('ellipse')} />
          <ToolButton icon={<Square size={I} />} label="Rectangle" shortcut="R" {...t('rect')} />
          <ToolSep />
          <ToolButton icon={<RotateCw size={I} />} label="Rotate / flip" onClick={() => rotate(activeId, 90)} menu={rotateMenu} disabled={!session} />
          <ToolButton icon={<Contrast size={I} />} label="Invert" shortcut="I" onClick={() => toggleInvert(activeId)} disabled={!session} />
          <ToolButton icon={<Undo2 size={I} />} label="Reset view" shortcut="Esc" onClick={() => resetView(activeId)} disabled={!session} />
          <ToolButton icon={<Copy size={I} />} label="Copy image" shortcut="Ctrl+C" onClick={copy} disabled={!session} menu={viewMenu} />
          <ToolSep />
          {soon('Synchronize', <Link2 size={I} />)}
          {soon('Cine', <Film size={I} />)}
          <ToolSep />
          {soon('3D MPR', <Columns2 size={I} />)}
          {soon('Volume rendering', <Cuboid size={I} />)}
          <ToolSep />
          {soon('Export', <Download size={I} />)}
          {soon('Print', <Printer size={I} />)}
          {soon('DICOM tags', <Tags size={I} />)}
          <div className="flex-1" />
          <ToolButton icon={<CircleHelp size={I} />} label="Help" menu={[{ label: 'About this viewer', onSelect: () => setNotice(true) }, { label: 'Design system page', onSelect: () => { location.hash = '#/design' } }]} />
        </Toolbar>

        {progress && (
          <div className="border-b border-border bg-surface px-3 py-2">
            <Progress value={Math.round((progress.done / Math.max(1, progress.total)) * 100)} label={`Reading files: ${progress.done} / ${progress.total}`} />
          </div>
        )}

        <div className="flex min-h-0 flex-1">
          {session && (
            <div role="listbox" aria-label="Series" className="flex w-[120px] shrink-0 flex-col items-center gap-2 overflow-y-auto border-r border-border bg-surface py-2">
              {series.map((se) => {
                const shownIn = panels.slice(0, count).indexOf(se.seriesUid)
                return (
                  <SeriesThumb key={se.seriesUid} series={se} selected={selectedThumb === se.seriesUid}
                    panelIndex={shownIn >= 0 ? shownIn + 1 : undefined}
                    onSelect={() => setSelectedThumb(se.seriesUid)}
                    onOpen={() => showInActive(se.seriesUid)} />
                )
              })}
            </div>
          )}

          <div className="relative min-w-0 flex-1">
            {engineError && <p role="alert" className="p-6 text-danger">The image engine failed to start: {engineError}</p>}
            {engineReady && (
              <div className="grid h-full gap-0.5 bg-bg" style={{ gridTemplateColumns: `repeat(${layout[1]}, minmax(0,1fr))`, gridTemplateRows: `repeat(${layout[0]}, minmax(0,1fr))` }}>
                {Array.from({ length: count }, (_, i) => {
                  const se = findSeries(session, panels[i])
                  const ctx = se ? studyOf(session, se.seriesUid) : null
                  return (
                    <div key={i} ref={(n) => { panelEls.current[i] = n }} className="min-h-0 min-w-0">
                      <StackPanel viewportId={vpId(i)} series={se} patient={ctx?.patient ?? null} study={ctx?.study ?? null}
                        active={i === active && count > 1} hidePatient={hidePatient} showOverlay={showOverlay}
                        onActivate={() => setActive(i)}
                        onDropSeries={(uid) => setPanels((p) => { const n = [...p]; n[i] = uid; return n })} />
                    </div>
                  )
                })}
              </div>
            )}
            {!session && !progress && <StartScreen onFolder={() => folderInput.current?.click()} onFiles={() => fileInput.current?.click()} onDemo={openDemo} />}
            {dropping && (
              <div className="pointer-events-none absolute inset-2 grid place-items-center rounded-lg border-2 border-dashed border-accent bg-black/60 text-lg">Drop files or folders to open them</div>
            )}
          </div>
        </div>

        {toast && <div className="fixed bottom-4 right-4 z-50"><Toast {...toast} onClose={() => setToast(null)} /></div>}

        <SeriesDialog open={seriesOpen} onOpenChange={setSeriesOpen} session={session}
          onPick={(uid) => { showInActive(uid); setSeriesOpen(false) }} />

        <Dialog open={notice} onOpenChange={(v) => { if (!v && (noticeAck || !isFirstRun())) setNotice(false) }} title="Before you start"
          footer={<Button variant="primary" disabled={isFirstRun() && !noticeAck} onClick={() => { try { localStorage.setItem(NOTICE_KEY, '1') } catch { /* private mode */ } setNotice(false) }}>Continue</Button>}>
          <div className="flex gap-3">
            <Info size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden />
            <p className="text-sm text-muted">
              This is a free image viewer. It is not a certified medical device. It shows the images; the clinician who reads them is responsible for any diagnosis or treatment decision. Images you open stay on this computer.
            </p>
          </div>
          {isFirstRun() && <Checkbox label="I understand" checked={noticeAck} onChange={setNoticeAck} />}
        </Dialog>
      </div>
    </TooltipProvider>
  )
}

function isFirstRun() { try { return localStorage.getItem(NOTICE_KEY) !== '1' } catch { return true } }

function StartScreen({ onFolder, onFiles, onDemo }: { onFolder: () => void; onFiles: () => void; onDemo: () => void }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-bg p-4">
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-lg border border-dashed border-border p-8 text-center">
        <FolderOpen size={32} className="text-muted" aria-hidden />
        <div>
          <h1 className="text-lg">Open a study</h1>
          <p className="text-sm text-muted">Pick a folder, a disc or files, or drag them onto this window.</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="primary" onClick={onFolder}><FolderOpen size={14} />Open folder</Button>
          <Button onClick={onFiles}>Open files</Button>
        </div>
        <Button variant="ghost" size="sm" onClick={onDemo}><Sparkles size={14} />Try the demo study</Button>
      </div>
    </div>
  )
}

type SeriesRow = { id: string; num: string; mod: string; desc: string; images: number; patient: string; date: string }
function SeriesDialog({ open, onOpenChange, session, onPick }: { open: boolean; onOpenChange: (v: boolean) => void; session: Session | null; onPick: (uid: string) => void }) {
  const [filter, setFilter] = useState('')
  const rows: SeriesRow[] = []
  for (const p of session?.patients ?? []) for (const st of p.studies) for (const se of st.series as Series[]) {
    rows.push({ id: se.seriesUid, num: String(se.number ?? ''), mod: se.modality, desc: se.description || '—', images: se.imageIds.length, patient: p.name.replace(/\^/g, ' '), date: fmtDate(st.date) })
  }
  const cols: Column<SeriesRow>[] = [
    { key: 'num', label: '#', width: 44, mono: true }, { key: 'mod', label: 'Mod.', width: 56 }, { key: 'desc', label: 'Description' },
    { key: 'images', label: 'Images', width: 70, mono: true }, { key: 'patient', label: 'Patient', width: 150 }, { key: 'date', label: 'Date', width: 96, mono: true },
  ]
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Open series" size="lg"
      footer={<DialogClose asChild><Button>Close</Button></DialogClose>}>
      <input autoFocus aria-label="Search series" placeholder="Search…" value={filter} onChange={(e) => setFilter(e.target.value)}
        onKeyDown={(e) => {
          // ↓ moves into the list; Enter opens the first match
          const first = e.currentTarget.closest('[role=dialog]')?.querySelector<HTMLElement>('tbody tr[tabindex]')
          if (e.key === 'ArrowDown' && first) { e.preventDefault(); first.focus() }
          if (e.key === 'Enter' && first) { e.preventDefault(); first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) }
        }}
        className="h-7 w-64 rounded-sm border border-border-input bg-bg px-2 text-sm text-fg placeholder:text-disabled" />
      <div className="max-h-[50vh] overflow-auto">
        <DataTable label="Series" columns={cols} rows={rows} filter={filter} emptyText="Nothing is open yet." onRowActivate={(r) => onPick(r.id)} />
      </div>
      <p className="text-xs text-muted">Double-click or press Enter to show a series in the selected panel.</p>
    </Dialog>
  )
}
