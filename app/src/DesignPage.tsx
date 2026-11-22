import { useState, type ReactNode } from 'react'
import {
  ArrowDownUp, ArrowUpRight, Circle, Columns2, Contrast, Crosshair, Cuboid, Database, Disc, Download, Film, FolderOpen, Hand,
  Info, Layers, LayoutGrid, Link2, Pencil, Pentagon, Printer, Ruler, Server, Square, SunMoon, Tags, Triangle, Undo2, RotateCw, ZoomIn, CircleHelp, Archive,
} from 'lucide-react'
import { Button, Checkbox, Field, Kbd, NumberInput, Radio, Select, TextInput } from './ui/controls'
import { ContextMenu, Dialog, DialogClose, Menu, Progress, Toast, TooltipProvider, type MenuEntry } from './ui/overlays'
import { CineControl, LayoutPicker, SeriesThumbnail, ToolButton, ToolSep, Toolbar, Viewport } from './ui/viewer'
import { DataTable, type Column } from './ui/DataTable'

const I = 20 // icon size
const openMenu: MenuEntry[] = [
  { label: 'Open folder…', shortcut: 'Ctrl+O', icon: <FolderOpen size={14} /> },
  { label: 'Open files…', shortcut: 'Ctrl+Shift+O' },
  { label: 'Open disc', icon: <Disc size={14} /> },
  { label: 'Open ZIP archive…' },
  { type: 'separator' },
  { label: 'Search PACS…', shortcut: 'Ctrl+P', icon: <Server size={14} /> },
  { label: 'Local archive…', shortcut: 'Ctrl+L', icon: <Database size={14} /> },
  { type: 'separator' },
  { type: 'sub', label: 'Recent', items: [{ label: 'D:\\ (disc)' }, { label: 'Downloads\\study.zip' }] },
]
const wlMenu: MenuEntry[] = [
  { type: 'label', label: 'CT presets' },
  { label: 'Lung', shortcut: '2' }, { label: 'Mediastinum', shortcut: '3' }, { label: 'Bone', shortcut: '4' },
  { label: 'Brain', shortcut: '5' }, { label: 'Abdomen', shortcut: '6' },
  { type: 'separator' },
  { label: 'Default (from file)', shortcut: '1' }, { label: 'Custom presets…' },
]
const rotateMenu: MenuEntry[] = [
  { label: 'Rotate 90° right', shortcut: 'Ctrl+R' }, { label: 'Rotate 90° left' }, { label: 'Rotate 180°' },
  { type: 'separator' }, { label: 'Flip horizontal', shortcut: 'Ctrl+H' }, { label: 'Flip vertical' },
]
const viewportMenu: MenuEntry[] = [
  { label: 'Copy image', shortcut: 'Ctrl+C' },
  { label: 'Export…', shortcut: 'Ctrl+E' },
  { type: 'separator' },
  { type: 'check', label: 'Show overlay text', checked: true, shortcut: 'Ctrl+T' },
  { type: 'check', label: 'Show reference lines', checked: true },
  { type: 'check', label: 'Hide patient data', checked: false },
  { type: 'separator' },
  { label: 'Delete selected measurement', shortcut: 'Del' },
  { label: 'Delete all measurements', shortcut: 'Ctrl+Del' },
  { type: 'separator' },
  { label: 'DICOM tags…', shortcut: 'Ctrl+I' },
  { label: 'Synchronize with…', disabled: true },
]

type StudyRow = { id: number; name: string; pid: string; date: string; desc: string; mod: string; images: number }
const studies: StudyRow[] = [
  { id: 1, name: 'DOE^JANE', pid: '0004821', date: '2026-11-02', desc: 'CT Chest w/o contrast', mod: 'CT', images: 482 },
  { id: 2, name: 'ROE^RICHARD', pid: '0007713', date: '2026-10-28', desc: 'MR Brain', mod: 'MR', images: 1204 },
  { id: 3, name: 'POE^ANNA', pid: '0001190', date: '2026-10-15', desc: 'PET-CT whole body', mod: 'PT\\CT', images: 896 },
  { id: 4, name: 'MOE^LIAM', pid: '0012004', date: '2026-09-30', desc: 'Chest PA', mod: 'DX', images: 2 },
]
const cols: Column<StudyRow>[] = [
  { key: 'name', label: 'Patient', width: 150 }, { key: 'pid', label: 'ID', width: 90, mono: true },
  { key: 'date', label: 'Date', width: 100, mono: true }, { key: 'desc', label: 'Description' },
  { key: 'mod', label: 'Mod.', width: 64 }, { key: 'images', label: 'Images', width: 70, mono: true },
]

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-border pt-5">
      <header>
        <h2 className="text-lg">{title}</h2>
        {note && <p className="text-xs text-muted">{note}</p>}
      </header>
      {children}
    </section>
  )
}
const Cap = ({ children }: { children: ReactNode }) => <p className="text-2xs uppercase tracking-wide text-muted">{children}</p>

export default function DesignPage() {
  const [tool, setTool] = useState('wl')
  const [layout, setLayout] = useState<[number, number]>([2, 2])
  const [wl, setWl] = useState(1500)
  const [fmt, setFmt] = useState('jpeg')
  const [chk, setChk] = useState(true)
  const [filter, setFilter] = useState('')
  const t = (id: string) => ({ active: tool === id, onClick: () => setTool(id) })

  return (
    <TooltipProvider>
      <div className="min-h-full">
        {/* ---------------- App shell ---------------- */}
        <div className="flex h-[560px] flex-col border-b border-border">
          <Toolbar>
            <ToolButton icon={<FolderOpen size={I} />} label="Open" shortcut="Ctrl+O" menu={openMenu} />
            <ToolSep />
            <ToolButton icon={<LayoutGrid size={I} />} label="Layout" menu={[{ label: '1 × 1' }, { label: '1 × 2' }, { label: '2 × 2' }, { label: 'Custom…' }]} />
            <ToolButton icon={<Layers size={I} />} label="Series" shortcut="F4" />
            <ToolSep />
            <ToolButton icon={<ArrowDownUp size={I} />} label="Scroll" shortcut="B" {...t('scroll')} />
            <ToolButton icon={<SunMoon size={I} />} label="Window / level" shortcut="W" {...t('wl')} menu={wlMenu} />
            <ToolButton icon={<ZoomIn size={I} />} label="Zoom" shortcut="Z" {...t('zoom')} />
            <ToolButton icon={<Hand size={I} />} label="Pan" shortcut="P" {...t('pan')} />
            <ToolSep />
            <ToolButton icon={<Ruler size={I} />} label="Length" shortcut="L" {...t('len')} menu={[{ label: 'Length' }, { label: 'Length ratio' }, { label: 'Deviation' }, { label: 'Calibrate…' }]} />
            <ToolButton icon={<Triangle size={I} />} label="Angle" shortcut="A" {...t('ang')} menu={[{ label: 'Angle' }, { label: 'Cobb angle' }]} />
            <ToolButton icon={<Circle size={I} />} label="Ellipse" shortcut="E" {...t('ell')} />
            <ToolButton icon={<Square size={I} />} label="Rectangle" {...t('rect')} />
            <ToolButton icon={<Pentagon size={I} />} label="Polygon" {...t('poly')} menu={[{ label: 'Closed polygon' }, { label: 'Open polygon' }]} />
            <ToolButton icon={<ArrowUpRight size={I} />} label="Arrow" {...t('arr')} />
            <ToolButton icon={<Pencil size={I} />} label="Pen" {...t('pen')} />
            <ToolButton icon={<Crosshair size={I} />} label="3D cursor" {...t('cur')} />
            <ToolSep />
            <ToolButton icon={<RotateCw size={I} />} label="Rotate / flip" menu={rotateMenu} />
            <ToolButton icon={<Contrast size={I} />} label="Invert" shortcut="I" />
            <ToolButton icon={<Undo2 size={I} />} label="Reset view" shortcut="Esc" />
            <ToolSep />
            <ToolButton icon={<Link2 size={I} />} label="Synchronize" shortcut="S" active />
            <ToolButton icon={<Film size={I} />} label="Cine" shortcut="C" />
            <ToolSep />
            <ToolButton icon={<Columns2 size={I} />} label="3D MPR" />
            <ToolButton icon={<Cuboid size={I} />} label="Volume rendering" />
            <ToolButton icon={<Layers size={I} />} label="Fusion" disabled />
            <ToolSep />
            <ToolButton icon={<Download size={I} />} label="Export" shortcut="Ctrl+E" />
            <ToolButton icon={<Printer size={I} />} label="Print" shortcut="Ctrl+P" />
            <ToolButton icon={<Tags size={I} />} label="DICOM tags" shortcut="Ctrl+I" />
            <div className="flex-1" />
            <ToolButton icon={<CircleHelp size={I} />} label="Help" menu={[{ label: 'Keyboard and mouse…' }, { label: 'About' }]} />
          </Toolbar>
          <div className="flex min-h-0 flex-1">
            <div role="listbox" aria-label="Series" className="flex w-[120px] shrink-0 flex-col items-center gap-2 overflow-y-auto border-r border-border bg-surface py-2">
              <SeriesThumbnail number={2} modality="CT" count={1} description="Scout" seed={3} />
              <SeriesThumbnail number={3} modality="CT" count={240} description="Axial 1.25 mm lung" selected panelIndex={1} seed={0} />
              <SeriesThumbnail number={4} modality="CT" count={240} description="Axial 1.25 mm mediastinum" panelIndex={2} seed={1} />
              <SeriesThumbnail number={5} modality="CT" count={96} description="Coronal reformat" state="loading" />
              <SeriesThumbnail number={6} modality="SR" count={1} description="Dose report" state="failed" />
            </div>
            <ContextMenu items={viewportMenu}>
              <div className="grid flex-1 grid-cols-2 grid-rows-2 gap-0.5 bg-bg">
                <Viewport state="rendered" active synced seed={0} />
                <div className="relative">
                  <Viewport state="rendered" synced seed={1} showMeasurements={false} hidePatient />
                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2"><CineControl /></div>
                </div>
                <Viewport state="loading" loadingPct={62} />
                <Viewport state="empty" />
              </div>
            </ContextMenu>
          </div>
        </div>

        {/* ---------------- Primitives ---------------- */}
        <main className="mx-auto flex max-w-[1100px] flex-col gap-6 px-6 py-6">
          <header className="flex flex-col gap-1">
            <h1 className="text-xl">Design system: primitives</h1>
            <p className="text-sm text-muted">
              Right-click the panels above for the context menu. Hover toolbar buttons for tooltips. Tokens come from <code className="font-mono text-xs">replica/design/tokens.json</code>.
              Values are provisional until they are measured against the installed original.
            </p>
          </header>

          <Section title="Buttons" note="primary · secondary · ghost · danger, at sm / md / lg, plus disabled and loading">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary">Export</Button><Button>Cancel</Button><Button variant="ghost">Reset</Button><Button variant="danger">Delete study</Button>
              <Button variant="primary" size="sm">Small</Button><Button variant="primary" size="lg">Large</Button>
              <Button disabled>Disabled</Button><Button variant="primary" loading>Retrieving</Button>
            </div>
          </Section>

          <Section title="Form controls" note="28px high, labelled, keyboard steppers on numbers (Shift = ×10)">
            <div className="grid grid-cols-3 gap-4">
              <Field label="AE title">{(id) => <TextInput id={id} defaultValue="VIEWER" />}</Field>
              <Field label="Window width" hint="↑ / ↓ to step, Shift for ×10">{(id, d) => <NumberInput id={id} aria-describedby={d} value={wl} onChange={setWl} min={1} max={10000} />}</Field>
              <Field label="Port" error="Port must be between 1 and 65535">{(id, d) => <TextInput id={id} aria-describedby={d} aria-invalid defaultValue="99999" />}</Field>
              <Field label="Retrieve with">{(id) => <Select id={id} defaultValue="move"><option value="move">C-MOVE</option><option value="get">C-GET</option></Select>}</Field>
              <Field label="Read-only">{(id) => <TextInput id={id} readOnly value="1.2.840.10008.1.2.4.80" />}</Field>
              <Field label="Disabled">{(id) => <TextInput id={id} disabled placeholder="Not available" />}</Field>
            </div>
            <div className="flex gap-10">
              <div className="flex flex-col gap-2">
                <Checkbox label="Include measurements" checked={chk} onChange={setChk} />
                <Checkbox label="Anonymize on export" checked={false} onChange={() => {}} />
                <Checkbox label="Disabled option" checked={false} onChange={() => {}} disabled />
              </div>
              <Radio name="fmt" value={fmt} onChange={setFmt} options={[{ value: 'jpeg', label: 'JPEG' }, { value: 'bmp', label: 'BMP' }, { value: 'dicom', label: 'DICOM' }]} />
            </div>
          </Section>

          <Section title="Menus, layout picker, cine" note="Radix: arrow keys, typeahead, Esc, focus returns to trigger">
            <div className="flex flex-wrap items-start gap-6">
              <Menu items={openMenu} trigger={<Button>Open menu</Button>} />
              <Menu items={viewportMenu} trigger={<Button>Viewport menu</Button>} />
              <div className="flex flex-col gap-1"><Cap>Layout</Cap><LayoutPicker value={layout} onChange={setLayout} /></div>
              <div className="flex flex-col gap-1"><Cap>Cine</Cap><CineControl /></div>
              <div className="flex flex-col gap-1"><Cap>Shortcut chip</Cap><span className="flex gap-1"><Kbd>Ctrl</Kbd><Kbd>Shift</Kbd><Kbd>N</Kbd></span></div>
            </div>
          </Section>

          <Section title="Viewport states" note="empty · loading · error · rendered (uncalibrated) · hidden patient data">
            <div className="grid h-48 grid-cols-4 gap-0.5">
              <Viewport state="empty" />
              <Viewport state="loading" loadingPct={18} />
              <Viewport state="error" errorText="This file uses a compression we can't decode yet (JPEG XL)." />
              <Viewport state="rendered" uncalibrated seed={4} />
            </div>
          </Section>

          <Section title="Data table" note="sortable (click headers), Ctrl / Shift multi-select, filter, loading, empty and error states">
            <div className="flex items-end gap-2">
              <div className="w-64"><Field label="Filter">{(id) => <TextInput id={id} placeholder="Name, ID, description…" value={filter} onChange={(e) => setFilter(e.target.value)} />}</Field></div>
            </div>
            <DataTable label="Studies" columns={cols} rows={studies} filter={filter} emptyText="No studies yet." />
            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-1"><Cap>Loading</Cap><DataTable label="Loading" columns={cols.slice(0, 3)} rows={[]} state="loading" emptyText="" /></div>
              <div className="flex flex-col gap-1"><Cap>Empty</Cap><DataTable label="Empty" columns={cols.slice(0, 3)} rows={[]} emptyText="No studies in this archive yet." emptyAction={<Button size="sm" variant="primary"><Archive size={14} />Import</Button>} /></div>
              <div className="flex flex-col gap-1"><Cap>Error</Cap><DataTable label="Error" columns={cols.slice(0, 3)} rows={[]} state="error" emptyText="" onRetry={() => {}} /></div>
            </div>
          </Section>

          <Section title="Dialog" note="focus trap, Esc closes, Enter = primary">
            <div>
            <Dialog
              title="Export images"
              trigger={<Button variant="primary"><Download size={14} />Open export dialog</Button>}
              footer={<><DialogClose asChild><Button>Cancel</Button></DialogClose><Button variant="primary">Export</Button></>}
            >
              <Field label="Format">{(id) => <Select id={id} value={fmt} onChange={(e) => setFmt(e.target.value)}><option value="jpeg">JPEG</option><option value="bmp">BMP</option><option value="mp4">MP4 video</option><option value="dicom">DICOM (original files)</option></Select>}</Field>
              <div className="flex flex-col gap-1"><span className="text-xs text-muted">What to export</span>
                <Radio name="scope" value="series" onChange={() => {}} options={[{ value: 'image', label: 'Current image' }, { value: 'series', label: 'Current series (240 images)' }, { value: 'all', label: 'All open series' }]} />
              </div>
              <Field label="Save to">{(id) => <TextInput id={id} defaultValue="C:\Users\doctor\Documents\Exports" />}</Field>
              <Checkbox label="Burn in measurements and overlay text" checked={chk} onChange={setChk} />
            </Dialog>
            </div>
          </Section>

          <Section title="Progress and toasts">
            <div className="grid grid-cols-2 gap-6">
              <div className="flex flex-col gap-4">
                <Progress value={26} label="Importing 312 / 1,204 files" onCancel={() => {}} />
                <Progress value={null} label="Contacting PACS…" />
              </div>
              <div className="flex flex-col gap-2">
                <Toast tone="success" title="Study received" body="CT Chest from MAIN_PACS · 482 images" action={<Button size="sm">Open</Button>} onClose={() => {}} />
                <Toast tone="warning" title="3 files skipped" body="They are not DICOM files." onClose={() => {}} />
                <Toast tone="danger" title="Retrieve failed" body="MAIN_PACS refused the connection (association rejected)." action={<Button size="sm">Retry</Button>} />
              </div>
            </div>
          </Section>

          <Section title="Notice" note="shown on first launch and in About">
            <div className="flex max-w-xl gap-3 rounded-md border border-border bg-surface p-3">
              <Info size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden />
              <p className="text-sm text-muted">
                This viewer is not a certified medical device. It displays images; the clinician reviewing them is responsible for any diagnosis or treatment decision.
              </p>
            </div>
          </Section>
        </main>
      </div>
    </TooltipProvider>
  )
}
