// DICOMDIR writer (DICOM PS3.10 media storage directory, PS3.3 Annex F), for the patient disc folder (D3).
// Explicit VR little endian, defined lengths. Text keys are copied byte for byte from each source file,
// together with its Specific Character Set, so names in any language stay exactly as they were.
import type { DataSet } from 'dicom-parser'

/** One image file on the disc: its File ID components (e.g. DICOM PAT00001 STU00001 SER00001 IMG00001) and its header. */
export type DirEntry = { fileId: string[]; ds: DataSet }

const MEDIA_STORAGE_DIRECTORY = '1.2.840.10008.1.3.10'
const EXPLICIT_LE = '1.2.840.10008.1.2.1'
const IMPLICIT_LE = '1.2.840.10008.1.2'
// this viewer's implementation class UID (a 2.25 UUID-derived root, generated once)
const IMPLEMENTATION_UID = '2.25.302458165207431069227538160402719858411'
const IMPLEMENTATION_VERSION = 'DICOMVIEWER_0_1'

type El = { tag: number; vr: string; value: Uint8Array }
const LONG = new Set(['OB', 'OW', 'OF', 'SQ', 'UT', 'UN'])
const ascii = new TextEncoder()

function pad(v: Uint8Array, vr: string) {
  if (v.length % 2 === 0) return v
  const o = new Uint8Array(v.length + 1)
  o.set(v)
  o[v.length] = vr === 'UI' || vr === 'OB' ? 0 : 0x20
  return o
}
const str = (tag: number, vr: string, s: string): El => ({ tag, vr, value: pad(ascii.encode(s), vr) })
const ul = (tag: number, n: number): El => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); return { tag, vr: 'UL', value: b } }
const us = (tag: number, n: number): El => { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, n, true); return { tag, vr: 'US', value: b } }

const key = (tag: number) => 'x' + tag.toString(16).padStart(8, '0')
const read = (ds: DataSet, tag: number) => (ds.string(key(tag)) ?? '').trim()

/** The element's raw bytes from the source file, or `fallback` (ASCII) when it is missing or empty. */
function copy(ds: DataSet, tag: number, vr: string, fallback = ''): El {
  const e = ds.elements[key(tag)]
  if (e && e.length > 0 && e.dataOffset + e.length <= ds.byteArray.length) {
    let raw = ds.byteArray.slice(e.dataOffset, e.dataOffset + e.length)
    // trailing padding is re-added by pad(); NUL padding on text is not valid outside UI
    let end = raw.length
    while (end > 0 && (raw[end - 1] === 0 || raw[end - 1] === 0x20)) end--
    raw = raw.slice(0, end)
    if (raw.length) return { tag, vr, value: pad(raw, vr) }
  }
  return str(tag, vr, fallback)
}

function encode(el: El): Uint8Array {
  const long = LONG.has(el.vr)
  const head = new Uint8Array(long ? 12 : 8)
  const dv = new DataView(head.buffer)
  dv.setUint16(0, el.tag >>> 16, true)
  dv.setUint16(2, el.tag & 0xffff, true)
  head[4] = el.vr.charCodeAt(0)
  head[5] = el.vr.charCodeAt(1)
  if (long) dv.setUint32(8, el.value.length, true)
  else dv.setUint16(6, el.value.length, true)
  return concat([head, el.value])
}

function concat(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}

type Rec = { type: string; keys: El[]; children: Rec[]; size: number; offset: number; next: Rec | null }

/** Fixed elements every record carries: next (UL), in-use flag (US), lower level (UL), record type (CS). */
function recordSize(r: Rec) {
  const links = 12 + 10 + 12
  const type = encode(str(0x00041430, 'CS', r.type)).length
  return 8 + links + type + r.keys.reduce((n, k) => n + encode(k).length, 0)
}

function encodeRecord(r: Rec) {
  const els = [
    ul(0x00041400, r.next?.offset ?? 0),
    us(0x00041410, 0xffff),
    ul(0x00041420, r.children[0]?.offset ?? 0),
    str(0x00041430, 'CS', r.type),
    ...r.keys,
  ].sort((a, b) => a.tag - b.tag)
  const body = concat(els.map(encode))
  const item = new Uint8Array(8)
  const dv = new DataView(item.buffer)
  dv.setUint16(0, 0xfffe, true); dv.setUint16(2, 0xe000, true); dv.setUint32(4, body.length, true)
  return concat([item, body])
}

const charset = (ds: DataSet) => (ds.elements[key(0x00080005)] ? [copy(ds, 0x00080005, 'CS')] : [])

function randomUid() {
  const b = crypto.getRandomValues(new Uint8Array(16))
  let n = 0n
  for (const x of b) n = (n << 8n) | BigInt(x)
  return `2.25.${n}`
}

export function writeDicomDir(entries: DirEntry[], fileSetId = ''): Uint8Array {
  // ---------------------------------------------------------------- the tree: patient > study > series > image
  const patients = new Map<string, Rec>(), studies = new Map<string, Rec>(), series = new Map<string, Rec>()
  const rec = (type: string, keys: El[]): Rec => ({ type, keys, children: [], size: 0, offset: 0, next: null })
  for (const { fileId, ds } of entries) {
    const pKey = `${read(ds, 0x00100020)}|${read(ds, 0x00100010)}`
    let p = patients.get(pKey)
    if (!p) {
      p = rec('PATIENT', [...charset(ds), copy(ds, 0x00100010, 'PN'), copy(ds, 0x00100020, 'LO', 'UNKNOWN')])
      patients.set(pKey, p)
    }
    const stUid = read(ds, 0x0020000d)
    let st = studies.get(stUid)
    if (!st) {
      st = rec('STUDY', [
        ...charset(ds), copy(ds, 0x00080020, 'DA'), copy(ds, 0x00080030, 'TM'), copy(ds, 0x00080050, 'SH'),
        copy(ds, 0x00081030, 'LO'), copy(ds, 0x0020000d, 'UI'), copy(ds, 0x00200010, 'SH', '1'),
      ])
      studies.set(stUid, st)
      p.children.push(st)
    }
    const seUid = read(ds, 0x0020000e)
    let se = series.get(seUid)
    if (!se) {
      se = rec('SERIES', [...charset(ds), copy(ds, 0x00080060, 'CS', 'OT'), copy(ds, 0x0020000e, 'UI'), copy(ds, 0x00200011, 'IS', '0')])
      series.set(seUid, se)
      st.children.push(se)
    }
    se.children.push(rec('IMAGE', [
      ...charset(ds),
      str(0x00041500, 'CS', fileId.join('\\')),
      copy(ds, 0x00080016, 'UI'),
      copy(ds, 0x00080018, 'UI'),
      str(0x00041512, 'UI', read(ds, 0x00020010) || IMPLICIT_LE),
      copy(ds, 0x00200013, 'IS', String(se.children.length + 1)),
    ].map((e) => (e.tag === 0x00080016 ? { ...e, tag: 0x00041510 } : e.tag === 0x00080018 ? { ...e, tag: 0x00041511 } : e))))
  }

  // ---------------------------------------------------------------- order (depth first), sizes, sibling links
  const order: Rec[] = []
  const visit = (list: Rec[]) => list.forEach((r, i) => { r.next = list[i + 1] ?? null; order.push(r); visit(r.children) })
  const roots = [...patients.values()]
  visit(roots)

  // ---------------------------------------------------------------- file meta information
  const meta = [
    { tag: 0x00020001, vr: 'OB', value: new Uint8Array([0, 1]) },
    str(0x00020002, 'UI', MEDIA_STORAGE_DIRECTORY),
    str(0x00020003, 'UI', randomUid()),
    str(0x00020010, 'UI', EXPLICIT_LE),
    str(0x00020012, 'UI', IMPLEMENTATION_UID),
    str(0x00020013, 'SH', IMPLEMENTATION_VERSION),
  ].map(encode)
  const metaBody = concat(meta)
  const preamble = concat([new Uint8Array(128), ascii.encode('DICM'), encode(ul(0x00020000, metaBody.length)), metaBody])

  // header elements before the sequence have fixed sizes, so record offsets are known up front
  const headerEls = (first: number, last: number) => concat([
    encode(str(0x00041130, 'CS', fileSetId)),
    encode(ul(0x00041200, first)),
    encode(ul(0x00041202, last)),
    encode(us(0x00041212, 0)),
  ])
  let offset = preamble.length + headerEls(0, 0).length + 12 // + SQ header
  for (const r of order) { r.size = recordSize(r); r.offset = offset; offset += r.size }

  const items = concat(order.map(encodeRecord))
  const sqHead = encode({ tag: 0x00041220, vr: 'SQ', value: new Uint8Array(0) }).slice(0, 12)
  new DataView(sqHead.buffer).setUint32(8, items.length, true)
  return concat([preamble, headerEls(roots[0]?.offset ?? 0, roots.at(-1)?.offset ?? 0), sqHead, items])
}

/** File ID component for the n-th item at a level: PAT00001, STU00001, SER00001, IMG00001 (8 characters, ISO 9660 safe). */
export const fileIdPart = (prefix: 'PAT' | 'STU' | 'SER' | 'IMG', n: number) => `${prefix}${String(n).padStart(5, '0')}`
