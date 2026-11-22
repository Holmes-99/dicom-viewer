import { useState } from 'react'
import { Button, Checkbox, Field, NumberInput, Radio, TextInput } from '../ui/controls'
import { Dialog, DialogClose, Progress } from '../ui/overlays'
import { encode, panelCanvas, showImage, type ImageFormat } from './actions'
import { stackViewport } from './engine'

// ------------------------------------------------------------ S13 export
type Scope = 'image' | 'series'

type DirHandle = { getFileHandle(name: string, o: { create: boolean }): Promise<{ createWritable(): Promise<{ write(b: Blob): Promise<void>; close(): Promise<void> }> }> }
const pickDir = (window as unknown as { showDirectoryPicker?: (o?: object) => Promise<DirHandle> }).showDirectoryPicker

function download(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

// Dialogs below start fresh each time they open: the caller remounts them with a new `key`.

export function ExportDialog({ open, onOpenChange, viewportId, getElement, baseName, onDone }: {
  open: boolean; onOpenChange: (v: boolean) => void; viewportId: string; getElement: () => HTMLElement | null; baseName: string
  onDone: (msg: { tone: 'success' | 'danger'; title: string; body?: string }) => void
}) {
  const [format, setFormat] = useState<ImageFormat>('jpeg')
  const [scope, setScope] = useState<Scope>('image')
  const [quality, setQuality] = useState(92)
  const [name, setName] = useState(baseName)
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null)

  const total = open ? stackViewport(viewportId)?.getImageIds().length ?? 0 : 0
  const ext = format === 'jpeg' ? 'jpg' : format
  const safe = (name.trim() || 'image').replace(/[\\/:*?"<>|]+/g, '_')

  const run = async () => {
    const element = getElement()
    if (!element) return
    const v = stackViewport(viewportId)
    if (!v) return
    try {
      if (scope === 'image') {
        const c = await panelCanvas(element)
        if (!c) throw new Error('Nothing to export')
        download(await encode(c, format, quality / 100), `${safe}.${ext}`)
        onDone({ tone: 'success', title: `Saved ${safe}.${ext}` })
      } else {
        // a folder picker writes every image in one go; without it the browser downloads them one by one
        const dir = pickDir ? await pickDir({ mode: 'readwrite' }).catch(() => null) : null
        if (pickDir && !dir) return // cancelled
        const start = v.getCurrentImageIdIndex()
        setBusy({ done: 0, total })
        for (let i = 0; i < total; i++) {
          await showImage(viewportId, i)
          const c = await panelCanvas(element)
          if (!c) continue
          const blob = await encode(c, format, quality / 100)
          const file = `${safe}_${String(i + 1).padStart(4, '0')}.${ext}`
          if (dir) { const w = await (await dir.getFileHandle(file, { create: true })).createWritable(); await w.write(blob); await w.close() }
          else download(blob, file)
          setBusy({ done: i + 1, total })
        }
        await showImage(viewportId, start)
        onDone({ tone: 'success', title: `Saved ${total} images` })
      }
      onOpenChange(false)
    } catch (e) {
      onDone({ tone: 'danger', title: 'Export failed', body: String(e) })
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v) }} title="Export images"
      footer={<>
        <DialogClose asChild><Button disabled={!!busy}>Cancel</Button></DialogClose>
        <Button variant="primary" onClick={run} loading={!!busy} disabled={!total}>Export</Button>
      </>}>
      <div className="grid grid-cols-2 gap-4">
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-xs text-muted">Format</legend>
          <Radio name="fmt" value={format} onChange={(v) => setFormat(v as ImageFormat)}
            options={[{ value: 'jpeg', label: 'JPEG' }, { value: 'bmp', label: 'BMP' }, { value: 'png', label: 'PNG' }]} />
        </fieldset>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-xs text-muted">Images</legend>
          <Radio name="scope" value={scope} onChange={(v) => setScope(v as Scope)}
            options={[{ value: 'image', label: 'Current image' }, { value: 'series', label: `Whole series (${total})` }]} />
        </fieldset>
      </div>
      {format === 'jpeg' && (
        <Field label="JPEG quality (%)">{(id) => <NumberInput id={id} value={quality} min={10} max={100} onChange={setQuality} />}</Field>
      )}
      <Field label="File name" hint={scope === 'series' ? `Saved as ${safe}_0001.${ext}, ${safe}_0002.${ext}, …` : `Saved as ${safe}.${ext}`}>
        {(id, d) => <TextInput id={id} aria-describedby={d} value={name} onChange={(e) => setName(e.target.value)} />}
      </Field>
      <p className="text-xs text-muted">The picture is saved as shown in the panel, with its measurements. Overlay text is not included.</p>
      {busy && <Progress value={Math.round((busy.done / Math.max(1, busy.total)) * 100)} label={`Exporting ${busy.done} / ${busy.total}`} />}
    </Dialog>
  )
}

// ------------------------------------------------------------ calibration
export function CalibrateDialog({ open, onOpenChange, measured, onApply }: {
  open: boolean; onOpenChange: (v: boolean) => void; measured: { length: number; unit: string } | null; onApply: (mm: number) => void
}) {
  const [mm, setMm] = useState(measured ? measured.length.toFixed(1) : '')
  const n = Number(mm.replace(',', '.'))
  const valid = n > 0 && Number.isFinite(n)
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Calibrate length"
      footer={<>
        <DialogClose asChild><Button>Cancel</Button></DialogClose>
        <Button variant="primary" disabled={!measured || !valid} onClick={() => onApply(n)}>Apply</Button>
      </>}>
      {measured ? (
        <>
          <p className="text-sm text-muted">Your last line measures <span className="font-mono text-fg">{measured.length.toFixed(2)} {measured.unit}</span>. Type its real length. Every image in this series is rescaled.</p>
          <Field label="Real length (mm)" error={mm && !valid ? 'Enter a length greater than 0.' : undefined}>
            {(id, d) => <TextInput id={id} aria-describedby={d} aria-invalid={!!mm && !valid} inputMode="decimal" autoFocus value={mm} onChange={(e) => setMm(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && valid) onApply(n) }} />}
          </Field>
        </>
      ) : (
        <p className="text-sm text-muted">Draw a line with the Length tool (L) over something of known size, such as a ruler or a calibration sphere, then open this again.</p>
      )}
    </Dialog>
  )
}

// ------------------------------------------------------------ ZIP password
export function PasswordDialog({ request, onAnswer }: {
  request: { zipName: string; retry: boolean } | null; onAnswer: (password: string | null) => void
}) {
  const [pw, setPw] = useState('')
  const [show, setShow] = useState(false)
  return (
    <Dialog open={!!request} onOpenChange={(v) => { if (!v) onAnswer(null) }} title="Password needed"
      footer={<>
        <Button onClick={() => onAnswer(null)}>Cancel</Button>
        <Button variant="primary" disabled={!pw} onClick={() => onAnswer(pw)}>Open</Button>
      </>}>
      <p className="text-sm text-muted">{request?.zipName} is protected.</p>
      <Field label="Password" error={request?.retry ? 'That password did not work. Try again.' : undefined}>
        {(id, d) => <TextInput id={id} aria-describedby={d} type={show ? 'text' : 'password'} autoFocus autoComplete="off" value={pw}
          onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && pw) onAnswer(pw) }} />}
      </Field>
      <Checkbox label="Show password" checked={show} onChange={setShow} />
    </Dialog>
  )
}
