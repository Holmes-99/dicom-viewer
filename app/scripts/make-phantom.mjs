// Writes a synthetic CT study (no patient data, no third-party files) as DICOM Part 10, Explicit VR Little Endian.
//   node scripts/make-phantom.mjs [outDir]       default: public/demo
// Series 2: scout (1 image). Series 3: axial lung window (80 slices). Series 4: axial mediastinum (80 slices, same geometry).
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const out = process.argv[2] ?? 'public/demo'
mkdirSync(out, { recursive: true })

const ROOT = '2.25.' // UUID-derived root, fine for synthetic data
let uidN = 0
const uid = () => `${ROOT}${BigInt('0x' + [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, '0')).join(''))}${++uidN}`

const LONG = new Set(['OB', 'OW', 'OF', 'SQ', 'UT', 'UN', 'UC', 'UR'])
function el(group, elem, vr, value) {
  let body
  if (value instanceof Uint8Array) body = value
  else if (vr === 'US') { body = new Uint8Array(2); new DataView(body.buffer).setUint16(0, value, true) }
  else if (vr === 'UL') { body = new Uint8Array(4); new DataView(body.buffer).setUint32(0, value, true) }
  else {
    let s = String(value)
    if (s.length % 2) s += vr === 'UI' ? '\0' : ' '
    body = new TextEncoder().encode(s)
  }
  if (body.length % 2) { const p = new Uint8Array(body.length + 1); p.set(body); body = p }
  const head = new Uint8Array(LONG.has(vr) ? 12 : 8)
  const dv = new DataView(head.buffer)
  dv.setUint16(0, group, true); dv.setUint16(2, elem, true)
  head[4] = vr.charCodeAt(0); head[5] = vr.charCodeAt(1)
  if (LONG.has(vr)) dv.setUint32(8, body.length, true)
  else dv.setUint16(6, body.length, true)
  return concat([head, body])
}
function concat(parts) {
  const n = parts.reduce((a, p) => a + p.length, 0)
  const o = new Uint8Array(n); let i = 0
  for (const p of parts) { o.set(p, i); i += p.length }
  return o
}

const CT = '1.2.840.10008.5.1.4.1.1.2'
const SC = '1.2.840.10008.5.1.4.1.1.7'
function part10(sopClass, sopUid, elements) {
  const metaBody = concat([
    el(0x0002, 0x0001, 'OB', new Uint8Array([0, 1])),
    el(0x0002, 0x0002, 'UI', sopClass),
    el(0x0002, 0x0003, 'UI', sopUid),
    el(0x0002, 0x0010, 'UI', '1.2.840.10008.1.2.1'),
    el(0x0002, 0x0012, 'UI', '2.25.1'),
    el(0x0002, 0x0013, 'SH', 'PHANTOMGEN1'),
  ])
  const meta = concat([el(0x0002, 0x0000, 'UL', metaBody.length), metaBody])
  const preamble = new Uint8Array(132); preamble.set([68, 73, 67, 77], 128) // "DICM"
  // elements must be in ascending tag order
  elements.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  return concat([preamble, meta, ...elements.map(([g, e, vr, v]) => el(g, e, vr, v))])
}

// ---- phantom: HU at (x,y,z) in mm, origin at volume centre ----
function hu(x, y, z) {
  const inE = (cx, cy, cz, rx, ry, rz) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2 <= 1
  if (!inE(0, 5, 0, 160, 120, 400)) return -1000
  if (inE(0, 85, 0, 18, 16, 400)) return 700 + 200 * Math.cos(z / 6)      // spine
  if (inE(32, -5, 15, 9, 9, 9)) return 40                                  // nodule in right lung (patient left on screen)
  if (inE(-55, -10, 0, 50, 70, 150) || inE(55, -10, 0, 50, 70, 150)) return -850 // lungs
  if (inE(-15, 20, -20, 45, 38, 60)) return 45                             // heart
  if (inE(0, -15, 0, 12, 12, 400)) return 180                              // aorta (contrast-like)
  return 30 + (inE(0, 5, 0, 150, 110, 400) ? 0 : -110)                     // soft tissue / fat rim
}

const patient = [
  [0x0010, 0x0010, 'PN', 'PHANTOM^DEMO'],
  [0x0010, 0x0020, 'LO', 'DEMO-0001'],
  [0x0010, 0x0030, 'DA', '19700101'],
  [0x0010, 0x0040, 'CS', 'O'],
]
const studyUid = uid()
const forUid = uid()
const study = [
  [0x0008, 0x0020, 'DA', '20261102'],
  [0x0008, 0x0030, 'TM', '091400'],
  [0x0008, 0x0050, 'SH', 'DEMO0001'],
  [0x0008, 0x0060, 'CS', 'CT'],
  [0x0008, 0x0070, 'LO', 'Synthetic'],
  [0x0008, 0x1030, 'LO', 'Demo chest phantom'],
  [0x0020, 0x000d, 'UI', studyUid],
  [0x0020, 0x0010, 'SH', '1'],
]

const N = 256, SP = 1.25 // pixel spacing mm
function writeSeries({ number, desc, slices, thickness, wc, ww, kernelNoise }) {
  const seriesUid = uid()
  for (let k = 0; k < slices; k++) {
    const z = -((slices - 1) / 2) * thickness + k * thickness
    const px = new Int16Array(N * N)
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = (i - N / 2) * SP, y = (j - N / 2) * SP
      px[j * N + i] = Math.round(hu(x, y, z) + (Math.random() - 0.5) * kernelNoise) + 1024
    }
    const sop = uid()
    const bytes = part10(CT, sop, [
      [0x0008, 0x0008, 'CS', 'ORIGINAL\\PRIMARY\\AXIAL'],
      [0x0008, 0x0016, 'UI', CT],
      [0x0008, 0x0018, 'UI', sop],
      [0x0008, 0x0031, 'TM', '091500'],
      [0x0008, 0x103e, 'LO', desc],
      ...study, ...patient,
      [0x0018, 0x0050, 'DS', String(thickness)],
      [0x0020, 0x000e, 'UI', seriesUid],
      [0x0020, 0x0011, 'IS', String(number)],
      [0x0020, 0x0013, 'IS', String(k + 1)],
      [0x0020, 0x0032, 'DS', `${(-N / 2) * SP}\\${(-N / 2) * SP}\\${z}`],
      [0x0020, 0x0037, 'DS', '1\\0\\0\\0\\1\\0'],
      [0x0020, 0x0052, 'UI', forUid],
      [0x0020, 0x1041, 'DS', String(z)],
      [0x0028, 0x0002, 'US', 1],
      [0x0028, 0x0004, 'CS', 'MONOCHROME2'],
      [0x0028, 0x0010, 'US', N],
      [0x0028, 0x0011, 'US', N],
      [0x0028, 0x0030, 'DS', `${SP}\\${SP}`],
      [0x0028, 0x0100, 'US', 16],
      [0x0028, 0x0101, 'US', 16],
      [0x0028, 0x0102, 'US', 15],
      [0x0028, 0x0103, 'US', 1],
      [0x0028, 0x1050, 'DS', String(wc)],
      [0x0028, 0x1051, 'DS', String(ww)],
      [0x0028, 0x1052, 'DS', '-1024'],
      [0x0028, 0x1053, 'DS', '1'],
      [0x7fe0, 0x0010, 'OW', new Uint8Array(px.buffer)],
    ])
    writeFileSync(join(out, `s${number}_${String(k + 1).padStart(3, '0')}.dcm`), bytes)
  }
  return seriesUid
}

// scout: a coronal-ish projection as a secondary-capture-like single CT image
function writeScout() {
  const seriesUid = uid(), sop = uid(), W = 256, H = 256
  const px = new Int16Array(W * H)
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    let s = 0
    for (let d = -150; d <= 150; d += 10) s += hu((i - W / 2) * SP, d, (j - H / 2) * 1.6)
    px[j * W + i] = Math.round(s / 31) + 1024
  }
  writeFileSync(join(out, 's2_001.dcm'), part10(SC, sop, [
    [0x0008, 0x0016, 'UI', SC], [0x0008, 0x0018, 'UI', sop], [0x0008, 0x103e, 'LO', 'Scout'],
    ...study, ...patient,
    [0x0020, 0x000e, 'UI', seriesUid], [0x0020, 0x0011, 'IS', '2'], [0x0020, 0x0013, 'IS', '1'],
    [0x0028, 0x0002, 'US', 1], [0x0028, 0x0004, 'CS', 'MONOCHROME2'], [0x0028, 0x0010, 'US', H], [0x0028, 0x0011, 'US', W],
    [0x0028, 0x0100, 'US', 16], [0x0028, 0x0101, 'US', 16], [0x0028, 0x0102, 'US', 15], [0x0028, 0x0103, 'US', 1],
    [0x0028, 0x1050, 'DS', '-200'], [0x0028, 0x1051, 'DS', '1400'], [0x0028, 0x1052, 'DS', '-1024'], [0x0028, 0x1053, 'DS', '1'],
    [0x7fe0, 0x0010, 'OW', new Uint8Array(px.buffer)],
  ]))
}

writeScout()
writeSeries({ number: 3, desc: 'Axial 2.5 mm lung', slices: 80, thickness: 2.5, wc: -600, ww: 1500, kernelNoise: 40 })
writeSeries({ number: 4, desc: 'Axial 2.5 mm mediastinum', slices: 80, thickness: 2.5, wc: 40, ww: 400, kernelNoise: 14 })
writeFileSync(join(out, 'index.json'), JSON.stringify(
  ['s2_001.dcm', ...[3, 4].flatMap((s) => Array.from({ length: 80 }, (_, k) => `s${s}_${String(k + 1).padStart(3, '0')}.dcm`))],
))
console.log(`wrote 161 files to ${out}`)
