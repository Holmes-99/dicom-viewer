import { useMemo, useState } from 'react'
import type { DataSet, Element } from 'dicom-parser'
import { Button } from '../ui/controls'
import { Dialog, DialogClose } from '../ui/overlays'
import { DataTable, type Column } from '../ui/DataTable'
import { TAG_NAMES, TRANSFER_SYNTAXES } from '../data/tag-names'
import { CHARSET_VRS, text } from '../data/charset'

// S12: every tag of the image shown in the selected panel. Search filters; Enter or double-click copies the value.

type TagRow = { id: string; tag: string; vr: string; name: string; value: string; depth: number }

const TEXT_VRS = new Set(['AE', 'AS', 'CS', 'DA', 'DS', 'DT', 'IS', 'LO', 'LT', 'PN', 'SH', 'ST', 'TM', 'UC', 'UI', 'UR', 'UT'])
const MAX_VALUE = 200

function value(ds: DataSet, el: Element, vr: string): string {
  const tag = el.tag
  if (el.items) return `${el.items.length} item${el.items.length === 1 ? '' : 's'}`
  if (tag === 'x7fe00010') return el.encapsulatedPixelData ? `compressed, ${el.fragments?.length ?? 0} fragments` : `${el.length} bytes`
  if (el.length === 0) return ''
  const n = (size: number, read: (i: number) => number | string | undefined) => {
    const out: string[] = []
    for (let i = 0; i < Math.min(16, el.length / size); i++) { const v = read(i); if (v !== undefined) out.push(String(v)) }
    return out.join('\\') + (el.length / size > 16 ? '\\…' : '')
  }
  switch (vr) {
    case 'US': return n(2, (i) => ds.uint16(tag, i))
    case 'SS': return n(2, (i) => ds.int16(tag, i))
    case 'UL': return n(4, (i) => ds.uint32(tag, i))
    case 'SL': return n(4, (i) => ds.int32(tag, i))
    case 'FL': return n(4, (i) => ds.float(tag, i))
    case 'FD': return n(8, (i) => ds.double(tag, i))
    case 'AT': return n(4, (i) => { const g = ds.uint16(tag, i * 2), e = ds.uint16(tag, i * 2 + 1); return g === undefined ? undefined : `(${hex(g)},${hex(e ?? 0)})` })
  }
  if (TEXT_VRS.has(vr) || (!vr && el.length < 256)) {
    const s = CHARSET_VRS.has(vr) ? text(ds, tag) : ds.string(tag) ?? ''
    // implicit VR files give no VR: show the text only if it looks like text
    if (!vr && /[^\x20-\x7e -￿]/.test(s)) return `${el.length} bytes`
    const shown = s.length > MAX_VALUE ? s.slice(0, MAX_VALUE) + '…' : s
    if (tag === 'x00020010' && TRANSFER_SYNTAXES[s]) return `${shown} (${TRANSFER_SYNTAXES[s]})`
    return shown
  }
  return `${el.length} bytes`
}

const hex = (n: number) => n.toString(16).toUpperCase().padStart(4, '0')

function flatten(ds: DataSet, depth = 0, prefix = ''): TagRow[] {
  const rows: TagRow[] = []
  for (const key of Object.keys(ds.elements).sort()) {
    const el = ds.elements[key]
    const raw = key.slice(1)
    const g = parseInt(raw.slice(0, 4), 16)
    const known = TAG_NAMES[raw]
    const vr = el.vr ?? known?.[1] ?? (el.items ? 'SQ' : '')
    const name = known?.[0] ?? (g % 2 === 1 ? 'Private tag' : raw.endsWith('0000') ? 'Group length' : '')
    const id = `${prefix}${raw}`
    rows.push({ id, tag: `(${raw.slice(0, 4).toUpperCase()},${raw.slice(4).toUpperCase()})`, vr, name, value: value(ds, el, vr), depth })
    el.items?.forEach((item, i) => {
      if (item.dataSet && depth < 4) {
        rows.push({ id: `${id}.${i}`, tag: '', vr: '', name: `Item ${i + 1}`, value: '', depth: depth + 1 })
        rows.push(...flatten(item.dataSet, depth + 2, `${id}.${i}.`))
      }
    })
  }
  return rows
}

export function TagsDialog({ open, onOpenChange, header, title, onCopied }: {
  open: boolean; onOpenChange: (v: boolean) => void; header: DataSet | null; title: string; onCopied: (what: string) => void
}) {
  const [filter, setFilter] = useState('')
  const rows = useMemo(() => (header && open ? flatten(header) : []), [header, open])
  const cols: Column<TagRow>[] = [
    { key: 'tag', label: 'Tag', width: 108, mono: true, render: (r) => <span style={{ paddingLeft: r.depth * 10 }}>{r.tag}</span> },
    { key: 'vr', label: 'VR', width: 44, mono: true },
    { key: 'name', label: 'Name', width: 240, render: (r) => <span className={r.name ? '' : 'text-disabled'} style={{ paddingLeft: r.tag ? 0 : r.depth * 10 }}>{r.name || 'Unknown'}</span> },
    { key: 'value', label: 'Value', mono: true, render: (r) => <span title={r.value}>{r.value}</span> },
  ]
  const copy = async (r: TagRow) => {
    try { await navigator.clipboard.writeText(r.value); onCopied(r.name || r.tag) } catch { /* clipboard refused */ }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="DICOM tags" size="lg"
      footer={<>
        <Button onClick={async () => { try { await navigator.clipboard.writeText(rows.map((r) => `${r.tag}\t${r.vr}\t${r.name}\t${r.value}`).join('\n')); onCopied('All tags') } catch { /* refused */ } }} disabled={!rows.length}>Copy all</Button>
        <DialogClose asChild><Button>Close</Button></DialogClose>
      </>}>
      <div className="flex items-center gap-3">
        <input autoFocus aria-label="Search tags" placeholder="Search tag, name or value…" value={filter} onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => {
            const first = e.currentTarget.closest('[role=dialog]')?.querySelector<HTMLElement>('tbody tr[tabindex]')
            if (e.key === 'ArrowDown' && first) { e.preventDefault(); first.focus() }
          }}
          className="h-7 w-72 rounded-sm border border-border-input bg-bg px-2 text-sm text-fg placeholder:text-disabled" />
        <span className="truncate text-xs text-muted">{title}</span>
      </div>
      <div className="max-h-[55vh] overflow-auto">
        <DataTable label="DICOM tags" columns={cols} rows={rows} filter={filter} emptyText="Select a panel that shows an image." onRowActivate={copy} />
      </div>
      <p className="text-xs text-muted">Double-click a row or press Enter to copy its value.</p>
    </Dialog>
  )
}
