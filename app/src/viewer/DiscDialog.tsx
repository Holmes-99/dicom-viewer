import { useEffect, useState } from 'react'
import type { DataSet } from 'dicom-parser'
import { Button, Checkbox } from '../ui/controls'
import { Dialog, DialogClose, Progress } from '../ui/overlays'
import type { DataSource, Session } from '../data/types'
import { desktop } from '../data/desktop'
import { fileIdPart, writeDicomDir, type DirEntry } from '../data/dicomdir'

// D3: Export → Prepare disc folder. Writes every open image, unchanged, into DICOM/PAT…/STU…/SER…/IMG…,
// a DICOMDIR index, a START HERE note and (Windows) the viewer itself, ready to burn or copy to a USB stick.
const CD = 700 * 1024 * 1024
const DVD = 4.7e9
const mb = (n: number) => `${Math.max(1, Math.round(n / 1024 / 1024))} MB`

type Item = { parts: string[]; file: File; ds: DataSet }
export type DiscResult = { tone: 'success' | 'warning' | 'danger'; title: string; body?: string }

function collect(session: Session, source: DataSource): Item[] {
  const out: Item[] = []
  session.patients.forEach((p, pi) => p.studies.forEach((st, ti) => st.series.forEach((se, si) => {
    let n = 0
    for (const inst of se.instances) {
      const file = source.getFile(inst.imageId)
      const ds = source.getHeader(inst.imageId) as DataSet | undefined
      if (!file || !ds) continue
      out.push({ file, ds, parts: ['DICOM', fileIdPart('PAT', pi + 1), fileIdPart('STU', ti + 1), fileIdPart('SER', si + 1), fileIdPart('IMG', ++n)] })
    }
  })))
  return out
}

export function DiscDialog({ open, onOpenChange, session, source, onDone }: {
  open: boolean; onOpenChange: (v: boolean) => void; session: Session | null; source: DataSource; onDone: (r: DiscResult) => void
}) {
  const [caps, setCaps] = useState<{ viewer: boolean; viewerBytes: number } | null>(null)
  const [withViewer, setWithViewer] = useState(true)
  const [busy, setBusy] = useState<{ done: number; total: number; step: string } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => { if (open && desktop) desktop.disc.caps().then(setCaps) }, [open])

  const items = open && session ? collect(session, source) : []
  const imageBytes = items.reduce((n, i) => n + i.file.size, 0)
  const total = imageBytes + (caps?.viewer && withViewer ? caps.viewerBytes : 0)
  const counts = session ? {
    patients: session.patients.length,
    studies: session.patients.reduce((n, p) => n + p.studies.length, 0),
    series: session.patients.reduce((n, p) => n + p.studies.reduce((m, s) => m + s.series.length, 0), 0),
  } : null

  const run = async () => {
    if (!desktop || !items.length) return
    setError('')
    const start = await desktop.disc.begin()
    if ('error' in start) {
      if (start.error === 'not-empty') setError(`“${start.name}” is not empty. Choose or create an empty folder.`)
      return
    }
    try {
      const useViewer = !!caps?.viewer && withViewer
      setBusy({ done: 0, total: items.length, step: 'Writing images' })
      for (let i = 0; i < items.length; i++) {
        const it = items[i]
        if (!(await desktop.disc.file(start.id, it.parts, new Uint8Array(await it.file.arrayBuffer())))) throw new Error(`Could not write ${it.file.name}`)
        setBusy({ done: i + 1, total: items.length, step: 'Writing images' })
      }
      const dir = writeDicomDir(items.map<DirEntry>((it) => ({ fileId: it.parts, ds: it.ds })))
      if (!(await desktop.disc.file(start.id, ['DICOMDIR'], dir))) throw new Error('Could not write DICOMDIR')
      if (useViewer) setBusy({ done: items.length, total: items.length, step: 'Copying the viewer (about a minute)' })
      const r = await desktop.disc.finish(start.id, useViewer)
      if (!r) throw new Error('The folder could not be finished')
      const fits = r.bytes <= CD ? 'Fits on a CD.' : r.bytes <= DVD ? 'Too big for a CD: use a DVD or a USB stick.' : 'Too big for a DVD: use a USB stick.'
      onDone({ tone: r.bytes <= DVD ? 'success' : 'warning', title: 'Disc folder ready', body: `${items.length} images in “${r.name}”, ${mb(r.bytes)}. ${fits}` })
      onOpenChange(false)
    } catch (e) {
      onDone({ tone: 'danger', title: 'The disc folder is incomplete', body: String(e instanceof Error ? e.message : e) })
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v) }} title="Prepare disc folder"
      footer={<>
        <DialogClose asChild><Button disabled={!!busy}>Cancel</Button></DialogClose>
        <Button variant="primary" onClick={run} loading={!!busy} disabled={!desktop || !items.length}>Choose folder…</Button>
      </>}>
      {!desktop ? (
        <p className="text-sm text-muted">Preparing a disc folder needs the desktop app.</p>
      ) : (
        <>
          <p className="text-sm">
            {counts && `${counts.patients} patient${counts.patients === 1 ? '' : 's'} · ${counts.studies} stud${counts.studies === 1 ? 'y' : 'ies'} · ${counts.series} series · `}
            {items.length} images ({mb(imageBytes)})
          </p>
          <p className="text-sm text-muted">
            The folder gets the images as they are, a DICOMDIR index and a “START HERE” note. Burn it with your computer’s own disc burner, or copy it to a USB stick.
          </p>
          {caps?.viewer
            ? <Checkbox label={`Add the viewer for Windows (${mb(caps.viewerBytes)}): it opens the images by itself`} checked={withViewer} onChange={setWithViewer} />
            : <p className="text-xs text-muted">The viewer can only be added from the installed or portable Windows version.</p>}
          <p className="text-xs text-muted">About {mb(total)} in total. A CD holds 700 MB, a DVD 4.7 GB.</p>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          {busy && <Progress value={Math.round((busy.done / Math.max(1, busy.total)) * 100)} label={`${busy.step}: ${busy.done} / ${busy.total}`} />}
        </>
      )}
    </Dialog>
  )
}
