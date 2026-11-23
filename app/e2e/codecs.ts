// Synthetic compressed DICOM files, one per transfer syntax the viewer claims to read (no patient data).
// Encoders: the codec libraries' own WebAssembly builds (JPEG-LS, JPEG 2000, HTJ2K, baseline JPEG),
// plus a small JPEG lossless and RLE encoder written here, and zlib for deflate.
import { createRequire } from 'node:module'
import { deflateRawSync } from 'node:zlib'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const MODULES = join(import.meta.dirname, '..', 'node_modules', '@cornerstonejs')
const N = 64

export type CodecCase = {
  file: string; desc: string; ts: string
  /** what the centre (inside the disc) and the top edge (background) must look like once rendered */
  kind: 'grey' | 'colour'
}

// ------------------------------------------------------------------ test images
/** 12-bit CT: a 400 HU disc on -1000 HU air, stored with intercept -1024; a gentle ramp so a wrong bit shows */
function ct12() {
  const px = new Uint16Array(N * N)
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const hu = Math.hypot(x - N / 2, y - N / 2) < N / 4 ? 400 : -1000
    px[y * N + x] = hu + 1024 + ((x + y) % 4)
  }
  return px
}
/** 8-bit grey: 200 inside the disc, 10 outside */
function grey8() {
  const px = new Uint8Array(N * N)
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) px[y * N + x] = Math.hypot(x - N / 2, y - N / 2) < N / 4 ? 200 : 10
  return px
}
/** 8-bit RGB, interleaved: a red disc on blue */
function rgb8() {
  const px = new Uint8Array(N * N * 3)
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const inside = Math.hypot(x - N / 2, y - N / 2) < N / 4
    px.set(inside ? [220, 20, 20] : [20, 20, 220], (y * N + x) * 3)
  }
  return px
}
/** RGB -> YCbCr full range (PS3.3 C.7.6.3.1.2) */
function toYbrFull(rgb: Uint8Array) {
  const out = new Uint8Array(rgb.length)
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  for (let i = 0; i < rgb.length; i += 3) {
    const [r, g, b] = [rgb[i], rgb[i + 1], rgb[i + 2]]
    out[i] = c(0.299 * r + 0.587 * g + 0.114 * b)
    out[i + 1] = c(-0.168736 * r - 0.331264 * g + 0.5 * b + 128)
    out[i + 2] = c(0.5 * r - 0.418688 * g - 0.081312 * b + 128)
  }
  return out
}

// ------------------------------------------------------------------ encoders
type Codec = { getDecodedBuffer(fi: object): Uint8Array; getEncodedBuffer(): Uint8Array; encode(): void; [k: string]: unknown }
async function wasmEncode(path: string, cls: string, frameInfo: object, pixels: Uint8Array, setup?: (e: Codec) => void) {
  const factory = require(join(MODULES, path))
  const mod = await (factory.default ?? factory)()
  const enc: Codec = new mod[cls]()
  setup?.(enc)
  enc.getDecodedBuffer(frameInfo).set(pixels)
  enc.encode()
  return new Uint8Array(enc.getEncodedBuffer())
}
const bytes16 = (px: Uint16Array) => new Uint8Array(px.buffer.slice(0))

/** JPEG lossless, process 14, first-order prediction (transfer syntax 1.2.840.10008.1.2.4.70) */
export function jpegLossless(px: Uint16Array, w: number, h: number, precision: number) {
  const out: number[] = []
  const u16 = (n: number) => out.push(n >> 8, n & 0xff)
  u16(0xffd8)
  u16(0xffc3); u16(11); out.push(precision); u16(h); u16(w); out.push(1, 1, 0x11, 0)
  // one Huffman table: categories 0..16, every code 5 bits long
  u16(0xffc4); u16(3 + 16 + 17); out.push(0x00)
  for (let l = 1; l <= 16; l++) out.push(l === 5 ? 17 : 0)
  for (let s = 0; s <= 16; s++) out.push(s)
  u16(0xffda); u16(8); out.push(1, 1, 0x00, 1, 0, 0)
  let acc = 0, nbits = 0
  const put = (value: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) {
      acc = (acc << 1) | ((value >> i) & 1)
      if (++nbits === 8) { out.push(acc); if (acc === 0xff) out.push(0); acc = 0; nbits = 0 }
    }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const pred = x === 0 && y === 0 ? 1 << (precision - 1) : x === 0 ? px[(y - 1) * w] : px[y * w + x - 1]
    let diff = (px[y * w + x] - pred) & 0xffff
    if (diff >= 0x8000) diff -= 0x10000
    const ssss = diff === -32768 ? 16 : diff === 0 ? 0 : 32 - Math.clz32(Math.abs(diff))
    put(ssss, 5) // canonical code of category s is s (all 5 bits)
    if (ssss && ssss < 16) put(diff > 0 ? diff : diff - 1 + (1 << ssss), ssss)
  }
  if (nbits) put(0x7f, 8 - nbits)
  u16(0xffd9)
  return new Uint8Array(out)
}

/** DICOM RLE (PS3.5 annex G): one segment per byte plane, rows as literal runs */
export function rle(planes: Uint8Array[], w: number, h: number) {
  const segs = planes.map((plane) => {
    const s: number[] = []
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x += 128) {
      const n = Math.min(128, w - x)
      s.push(n - 1, ...plane.subarray(y * w + x, y * w + x + n))
    }
    if (s.length % 2) s.push(0)
    return s
  })
  const header = new Uint32Array(16)
  header[0] = segs.length
  let off = 64
  segs.forEach((s, i) => { header[i + 1] = off; off += s.length })
  return concat([new Uint8Array(header.buffer), ...segs.map((s) => new Uint8Array(s))])
}

// ------------------------------------------------------------------ DICOM writer (explicit VR little endian)
function concat(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0))
  let i = 0
  for (const p of parts) { out.set(p, i); i += p.length }
  return out
}
const LONG = new Set(['OB', 'OW', 'SQ', 'UT', 'UN'])
type El = [number, number, string, string | number | Uint8Array]
function el([g, e, vr, v]: El) {
  let body = v instanceof Uint8Array ? v
    : vr === 'US' ? new Uint8Array(new Uint16Array([Number(v)]).buffer)
    : vr === 'UL' ? new Uint8Array(new Uint32Array([Number(v)]).buffer)
    : new TextEncoder().encode(String(v))
  if (body.length % 2) body = concat([body, new Uint8Array([vr === 'UI' || vr === 'OB' ? 0 : 0x20])])
  const h = new Uint8Array(LONG.has(vr) ? 12 : 8)
  const dv = new DataView(h.buffer)
  dv.setUint16(0, g, true); dv.setUint16(2, e, true)
  h[4] = vr.charCodeAt(0); h[5] = vr.charCodeAt(1)
  if (LONG.has(vr)) dv.setUint32(8, body.length, true); else dv.setUint16(6, body.length, true)
  return concat([h, body])
}
/** pixel data as one encapsulated fragment, with an empty offset table */
function encapsulated(frame: Uint8Array) {
  const item = (tagE: number, data: Uint8Array) => {
    const h = new Uint8Array(8); const dv = new DataView(h.buffer)
    dv.setUint16(0, 0xfffe, true); dv.setUint16(2, tagE, true); dv.setUint32(4, data.length, true)
    return concat([h, data])
  }
  const data = frame.length % 2 ? concat([frame, new Uint8Array(1)]) : frame
  const h = new Uint8Array(12); const dv = new DataView(h.buffer)
  dv.setUint16(0, 0x7fe0, true); dv.setUint16(2, 0x0010, true); h[4] = 0x4f; h[5] = 0x42; dv.setUint32(8, 0xffffffff, true)
  return concat([h, item(0xe000, new Uint8Array(0)), item(0xe000, data), item(0xe0dd, new Uint8Array(0))])
}

let n = 0
const uid = () => `2.25.7${Date.now() % 1e9}${++n}`
const STUDY = uid()

type Image = { colour: boolean; bits: 8 | 16; photometric: string; pixels: Uint8Array; encapsulated: boolean }
function file(c: CodecCase, img: Image, series: number) {
  const sop = uid()
  const sopClass = img.colour ? '1.2.840.10008.5.1.4.1.1.6.1' : '1.2.840.10008.5.1.4.1.1.2'
  const meta = concat([
    el([0x0002, 0x0001, 'OB', new Uint8Array([0, 1])]), el([0x0002, 0x0002, 'UI', sopClass]), el([0x0002, 0x0003, 'UI', sop]),
    el([0x0002, 0x0010, 'UI', c.ts]), el([0x0002, 0x0012, 'UI', '2.25.2']),
  ])
  const grey16 = !img.colour && img.bits === 16
  const els: El[] = [
    [0x0008, 0x0016, 'UI', sopClass], [0x0008, 0x0018, 'UI', sop], [0x0008, 0x0020, 'DA', '20260101'],
    [0x0008, 0x0060, 'CS', img.colour ? 'US' : 'CT'], [0x0008, 0x103e, 'LO', c.desc],
    [0x0010, 0x0010, 'PN', 'SYNTH^CODECS'], [0x0010, 0x0020, 'LO', 'E2E-0004'],
    [0x0020, 0x000d, 'UI', STUDY], [0x0020, 0x000e, 'UI', uid()], [0x0020, 0x0011, 'IS', String(series)], [0x0020, 0x0013, 'IS', '1'],
    [0x0028, 0x0002, 'US', img.colour ? 3 : 1], [0x0028, 0x0004, 'CS', img.photometric],
    ...(img.colour ? [[0x0028, 0x0006, 'US', 0] as El] : []),
    [0x0028, 0x0010, 'US', N], [0x0028, 0x0011, 'US', N], [0x0028, 0x0030, 'DS', '1\\1'],
    [0x0028, 0x0100, 'US', img.bits], [0x0028, 0x0101, 'US', grey16 ? 12 : 8], [0x0028, 0x0102, 'US', grey16 ? 11 : 7], [0x0028, 0x0103, 'US', 0],
    ...(img.colour ? [] : grey16
      ? [[0x0028, 0x1050, 'DS', '40'], [0x0028, 0x1051, 'DS', '400'], [0x0028, 0x1052, 'DS', '-1024'], [0x0028, 0x1053, 'DS', '1']] as El[]
      : [[0x0028, 0x1050, 'DS', '128'], [0x0028, 0x1051, 'DS', '256']] as El[]),
  ]
  els.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const pixel = img.encapsulated ? encapsulated(img.pixels) : el([0x7fe0, 0x0010, img.bits === 16 ? 'OW' : 'OB', img.pixels])
  let dataset = concat([...els.map(el), pixel])
  if (c.ts === '1.2.840.10008.1.2.1.99') dataset = new Uint8Array(deflateRawSync(dataset))
  const pre = new Uint8Array(132); pre.set([68, 73, 67, 77], 128)
  return concat([pre, el([0x0002, 0x0000, 'UL', meta.length]), meta, dataset])
}

export const CODECS: CodecCase[] = [
  { file: 'codec_jpeg_lossless.dcm', desc: 'JPEG lossless', ts: '1.2.840.10008.1.2.4.70', kind: 'grey' },
  { file: 'codec_jpeg_baseline.dcm', desc: 'JPEG baseline grey', ts: '1.2.840.10008.1.2.4.50', kind: 'grey' },
  { file: 'codec_jpeg_ls.dcm', desc: 'JPEG-LS lossless', ts: '1.2.840.10008.1.2.4.80', kind: 'grey' },
  { file: 'codec_j2k.dcm', desc: 'JPEG 2000 lossless', ts: '1.2.840.10008.1.2.4.90', kind: 'grey' },
  { file: 'codec_htj2k.dcm', desc: 'HTJ2K lossless', ts: '1.2.840.10008.1.2.4.201', kind: 'grey' },
  { file: 'codec_rle.dcm', desc: 'RLE lossless', ts: '1.2.840.10008.1.2.5', kind: 'grey' },
  { file: 'codec_deflate.dcm', desc: 'Deflated explicit LE', ts: '1.2.840.10008.1.2.1.99', kind: 'grey' },
  { file: 'codec_us_ybr_full.dcm', desc: 'US colour YBR_FULL', ts: '1.2.840.10008.1.2.1', kind: 'colour' },
  { file: 'codec_us_jpeg_ybr.dcm', desc: 'US colour JPEG YBR_FULL_422', ts: '1.2.840.10008.1.2.4.50', kind: 'colour' },
  { file: 'codec_us_rle_rgb.dcm', desc: 'US colour RLE RGB', ts: '1.2.840.10008.1.2.5', kind: 'colour' },
]

export async function buildCodecFixtures(): Promise<Map<string, Uint8Array>> {
  const ct = ct12(), ctBytes = bytes16(ct), g8 = grey8(), rgb = rgb8()
  const grey16 = { width: N, height: N, bitsPerSample: 16, componentCount: 1, isSigned: false }
  const planesOf16 = (px: Uint16Array) => [Uint8Array.from(px, (v) => v >> 8), Uint8Array.from(px, (v) => v & 0xff)]
  const planesOfRgb = (px: Uint8Array) => [0, 1, 2].map((c) => Uint8Array.from({ length: N * N }, (_, i) => px[i * 3 + c]))
  const enc = (bits: 8 | 16, pixels: Uint8Array, colour = false, photometric = colour ? 'RGB' : 'MONOCHROME2'): Image =>
    ({ colour, bits, photometric, pixels, encapsulated: true })

  const images: Record<string, Image> = {
    'codec_jpeg_lossless.dcm': enc(16, jpegLossless(ct, N, N, 12)),
    'codec_jpeg_baseline.dcm': enc(8, await wasmEncode('codec-libjpeg-turbo-8bit/dist/libjpegturbowasm.js', 'JPEGEncoder',
      { width: N, height: N, bitsPerSample: 8, componentCount: 1, isSigned: false }, g8, (e) => (e.setQuality as (a: boolean, q: number) => void)(false, 95))),
    'codec_jpeg_ls.dcm': enc(16, await wasmEncode('codec-charls/dist/charlswasm.js', 'JpegLSEncoder', { ...grey16, bitsPerSample: 12 }, ctBytes)),
    'codec_j2k.dcm': enc(16, await wasmEncode('codec-openjpeg/dist/openjpegwasm.js', 'J2KEncoder', grey16, ctBytes)),
    'codec_htj2k.dcm': enc(16, await wasmEncode('codec-openjph/dist/openjphjs.js', 'HTJ2KEncoder', { ...grey16, isUsingColorTransform: false }, ctBytes)),
    'codec_rle.dcm': enc(16, rle(planesOf16(ct), N, N)),
    'codec_deflate.dcm': { colour: false, bits: 16, photometric: 'MONOCHROME2', pixels: ctBytes, encapsulated: false },
    'codec_us_ybr_full.dcm': { colour: true, bits: 8, photometric: 'YBR_FULL', pixels: toYbrFull(rgb), encapsulated: false },
    'codec_us_jpeg_ybr.dcm': enc(8, await wasmEncode('codec-libjpeg-turbo-8bit/dist/libjpegturbowasm.js', 'JPEGEncoder',
      { width: N, height: N, bitsPerSample: 8, componentCount: 3, isSigned: false }, rgb, (e) => (e.setQuality as (a: boolean, q: number) => void)(false, 95)), true, 'YBR_FULL_422'),
    'codec_us_rle_rgb.dcm': enc(8, rle(planesOfRgb(rgb), N, N), true),
  }
  return new Map(CODECS.map((c, i) => [c.file, file(c, images[c.file], 20 + i)]))
}
