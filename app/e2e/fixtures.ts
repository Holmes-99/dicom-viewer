// Generates the synthetic test files the specs use (no real patient data). Run once by global-setup.ts.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { BlobReader, BlobWriter, ZipWriter } from '@zip.js/zip.js'
import dicomParser from 'dicom-parser'
import { buildCodecFixtures } from './codecs'
import { writeDicomDir } from '../src/data/dicomdir'

export const FIX = join(import.meta.dirname, '.fixtures')
export const DEMO = join(import.meta.dirname, '..', 'public', 'demo')

type TS = 'implicit' | 'explicitLE' | 'explicitBE'
const TS_UID: Record<TS, string> = { implicit: '1.2.840.10008.1.2', explicitLE: '1.2.840.10008.1.2.1', explicitBE: '1.2.840.10008.1.2.2' }
const LONG = new Set(['OB', 'OW', 'OF', 'SQ', 'UT', 'UN', 'UC', 'UR'])
type El = [group: number, elem: number, vr: string, value: string | number | Uint8Array]

function concat(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0))
  let i = 0
  for (const p of parts) { out.set(p, i); i += p.length }
  return out
}

function encode([g, e, vr, v]: El, ts: TS): Uint8Array {
  const le = ts !== 'explicitBE'
  let body: Uint8Array
  if (v instanceof Uint8Array) body = v
  else if (vr === 'US') { body = new Uint8Array(2); new DataView(body.buffer).setUint16(0, Number(v), le) }
  else if (vr === 'UL') { body = new Uint8Array(4); new DataView(body.buffer).setUint32(0, Number(v), le) }
  else {
    body = new TextEncoder().encode(String(v))
    if (body.length % 2) body = concat([body, new Uint8Array([vr === 'UI' ? 0 : 0x20])])
  }
  if (body.length % 2) body = concat([body, new Uint8Array(1)])
  if (ts === 'implicit') {
    const h = new Uint8Array(8); const dv = new DataView(h.buffer)
    dv.setUint16(0, g, true); dv.setUint16(2, e, true); dv.setUint32(4, body.length, true)
    return concat([h, body])
  }
  const h = new Uint8Array(LONG.has(vr) ? 12 : 8); const dv = new DataView(h.buffer)
  dv.setUint16(0, g, le); dv.setUint16(2, e, le)
  h[4] = vr.charCodeAt(0); h[5] = vr.charCodeAt(1)
  if (LONG.has(vr)) dv.setUint32(8, body.length, le); else dv.setUint16(6, body.length, le)
  return concat([h, body])
}

let n = 0
const uid = (tag: string) => `2.25.9${Date.now() % 1e9}${++n}${tag.length}`

export type ImageSpec = {
  ts?: TS; patientName: string; patientId: string; charset?: string
  studyUid: string; seriesUid: string; forUid: string; seriesNumber: number; seriesDesc: string
  instance: number; z: number; frames?: number; size?: number
}

/** A small CT image: a bright disc on a dark background, so inversion and rendering can be checked. */
export function dicom(s: ImageSpec): Uint8Array {
  const ts = s.ts ?? 'explicitLE', N = s.size ?? 64, frames = s.frames ?? 1
  const px = new Uint8Array(N * N * 2 * frames)
  const dv = new DataView(px.buffer)
  for (let f = 0; f < frames; f++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const r = Math.hypot(x - N / 2, y - N / 2)
    const hu = r < N / 4 + f * 2 ? 400 : -1000
    dv.setInt16((f * N * N + y * N + x) * 2, hu + 1024, ts !== 'explicitBE')
  }
  const sop = uid('sop')
  const meta = [
    encode([0x0002, 0x0001, 'OB', new Uint8Array([0, 1])], 'explicitLE'),
    encode([0x0002, 0x0002, 'UI', '1.2.840.10008.5.1.4.1.1.2'], 'explicitLE'),
    encode([0x0002, 0x0003, 'UI', sop], 'explicitLE'),
    encode([0x0002, 0x0010, 'UI', TS_UID[ts]], 'explicitLE'),
    encode([0x0002, 0x0012, 'UI', '2.25.2'], 'explicitLE'),
  ]
  const metaBody = concat(meta)
  const els: El[] = [
    ...(s.charset ? [[0x0008, 0x0005, 'CS', s.charset] as El] : []),
    [0x0008, 0x0016, 'UI', '1.2.840.10008.5.1.4.1.1.2'], [0x0008, 0x0018, 'UI', sop],
    [0x0008, 0x0020, 'DA', '20260101'], [0x0008, 0x0060, 'CS', 'CT'], [0x0008, 0x103e, 'LO', s.seriesDesc],
    [0x0010, 0x0010, 'PN', s.patientName], [0x0010, 0x0020, 'LO', s.patientId],
    [0x0020, 0x000d, 'UI', s.studyUid], [0x0020, 0x000e, 'UI', s.seriesUid],
    [0x0020, 0x0011, 'IS', String(s.seriesNumber)], [0x0020, 0x0013, 'IS', String(s.instance)],
    [0x0020, 0x0032, 'DS', `-40\\-40\\${s.z}`], [0x0020, 0x0037, 'DS', '1\\0\\0\\0\\1\\0'], [0x0020, 0x0052, 'UI', s.forUid],
    ...(frames > 1 ? [[0x0028, 0x0008, 'IS', String(frames)] as El] : []),
    [0x0028, 0x0002, 'US', 1], [0x0028, 0x0004, 'CS', 'MONOCHROME2'], [0x0028, 0x0010, 'US', N], [0x0028, 0x0011, 'US', N],
    [0x0028, 0x0030, 'DS', '1.25\\1.25'], [0x0028, 0x0100, 'US', 16], [0x0028, 0x0101, 'US', 16], [0x0028, 0x0102, 'US', 15], [0x0028, 0x0103, 'US', 1],
    [0x0028, 0x1050, 'DS', '40'], [0x0028, 0x1051, 'DS', '400'], [0x0028, 0x1052, 'DS', '-1024'], [0x0028, 0x1053, 'DS', '1'],
    [0x7fe0, 0x0010, 'OW', px],
  ]
  els.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const pre = new Uint8Array(132); pre.set([68, 73, 67, 77], 128)
  return concat([pre, encode([0x0002, 0x0000, 'UL', metaBody.length], 'explicitLE'), metaBody, ...els.map((x) => encode(x, ts))])
}

// 64 characters with accents and an emoji (UTF-8)
export const LONG_NAME = 'Ångström-Müller^Zoë-Élodie Façade 😀 Ñandú Øresund Þórsdóttir Ğül'.slice(0, 64)

export const FILES = {
  other1: 'other_patient_1.dcm', other2: 'other_patient_2.dcm',
  implicit: 'implicit_vr.dcm', bigEndian: 'big_endian.dcm', multiframe: 'multiframe.dcm',
  damaged: 'damaged.dcm', text: 'notes.txt', plainZip: 'study.zip', aesZip: 'locked.zip', dicomdir: 'DICOMDIR',
}
export const ZIP_PASSWORD = 'e2e-only-password'

export async function buildFixtures() {
  if (!existsSync(join(DEMO, 'index.json'))) execSync('node scripts/make-phantom.mjs', { cwd: join(import.meta.dirname, '..'), stdio: 'inherit' })
  mkdirSync(FIX, { recursive: true })
  const study = uid('st'), series = uid('se'), forUid = uid('for')
  const base = { patientName: LONG_NAME, patientId: 'E2E-0002', charset: 'ISO_IR 192', studyUid: study, seriesUid: series, forUid, seriesNumber: 7, seriesDesc: 'Other patient axial' }
  const other1 = dicom({ ...base, instance: 1, z: 0 })
  const other2 = dicom({ ...base, instance: 2, z: 5 })
  writeFileSync(join(FIX, FILES.other1), other1)
  writeFileSync(join(FIX, FILES.other2), other2)
  const single = (ts: TS, desc: string, frames = 1) => dicom({
    ts, frames, patientName: 'SYNTH^CODEC', patientId: 'E2E-0003', studyUid: uid('st'), seriesUid: uid('se'), forUid: uid('for'),
    seriesNumber: 1, seriesDesc: desc, instance: 1, z: 0,
  })
  writeFileSync(join(FIX, FILES.implicit), single('implicit', 'Implicit VR'))
  writeFileSync(join(FIX, FILES.bigEndian), single('explicitBE', 'Big endian'))
  writeFileSync(join(FIX, FILES.multiframe), single('explicitLE', 'Multiframe', 3))
  // damaged: the header stops in the middle of an element
  const whole = single('explicitLE', 'Damaged')
  writeFileSync(join(FIX, FILES.damaged), whole.slice(0, 400))
  writeFileSync(join(FIX, FILES.text), 'not a DICOM file\n')
  const zip = async (name: string, password?: string) => {
    const w = new ZipWriter(new BlobWriter('application/zip'), password ? { password, encryptionStrength: 3 } : {})
    await w.add(`study/${FILES.other1}`, new BlobReader(new Blob([other1])))
    await w.add(`study/${FILES.other2}`, new BlobReader(new Blob([other2])))
    writeFileSync(join(FIX, name), new Uint8Array(await (await w.close()).arrayBuffer()))
  }
  await zip(FILES.plainZip)
  await zip(FILES.aesZip, ZIP_PASSWORD)
  for (const [name, data] of await buildCodecFixtures()) writeFileSync(join(FIX, name), data)
  // a disc index on its own, pointing at one image
  const ds = dicomParser.parseDicom(other1, { untilTag: 'x7fe00010' })
  writeFileSync(join(FIX, FILES.dicomdir), writeDicomDir([{ fileId: ['DICOM', 'IMG1'], ds }]))
}
