import { Enums, metaData, utilities, type Types } from '@cornerstonejs/core'
import { annotation, utilities as toolUtils, LengthTool } from '@cornerstonejs/tools'
import { engine, stackViewport } from './engine'

// View actions on one panel. Each call re-renders that panel.
const vp = (id: string) => stackViewport(id)

export function scrollBy(id: string, delta: number) {
  const v = vp(id)
  if (!v || !v.getImageIds().length) return
  const n = v.getImageIds().length
  const next = Math.min(n - 1, Math.max(0, v.getCurrentImageIdIndex() + delta))
  v.setImageIdIndex(next)
}

export function scrollTo(id: string, where: 'first' | 'last') {
  const v = vp(id)
  if (!v || !v.getImageIds().length) return
  v.setImageIdIndex(where === 'first' ? 0 : v.getImageIds().length - 1)
}

export function setWindow(id: string, width: number, center: number) {
  const v = vp(id)
  if (!v) return
  v.setProperties({ voiRange: utilities.windowLevel.toLowHighRange(width, center) })
  v.render()
}

/** Back to the window stored in the file. */
export function resetWindow(id: string) {
  const v = vp(id)
  if (!v) return
  v.resetProperties()
  v.render()
}

export function toggleInvert(id: string) {
  const v = vp(id)
  if (!v) return
  v.setProperties({ invert: !v.getProperties().invert })
  v.render()
}

export function rotate(id: string, deg: 90 | -90 | 180) {
  const v = vp(id)
  if (!v) return
  const cur = (v.getViewPresentation().rotation ?? 0) as number
  v.setViewPresentation({ rotation: (cur + deg + 360) % 360 })
  v.render()
}

export function flip(id: string, axis: 'h' | 'v') {
  const v = vp(id)
  if (!v) return
  const cam = v.getCamera()
  v.setCamera(axis === 'h' ? { flipHorizontal: !cam.flipHorizontal } : { flipVertical: !cam.flipVertical })
  v.render()
}

export function resetView(id: string) {
  const v = vp(id)
  if (!v) return
  v.resetCamera()
  v.resetProperties()
  v.render()
}

// ------------------------------------------------------------ cine
const cineEl = (id: string) => vp(id)?.element as HTMLDivElement | undefined

/** loop: jump back to the first image at the end; otherwise bounce back and forth */
export function playCine(id: string, fps: number, loop = true) {
  const el = cineEl(id)
  if (!el || (vp(id)?.getImageIds().length ?? 0) < 2) return false
  toolUtils.cine.playClip(el, { framesPerSecond: fps, loop, bounce: !loop })
  return true
}

export function stopCine(id: string) {
  const el = cineEl(id)
  if (el) toolUtils.cine.stopClip(el)
}

// ------------------------------------------------------------ calibration
/**
 * The newest length measurement on this panel's current image, in mm (or px when the file has no spacing).
 * Calibration uses it: the user draws a line over something of known size and types the real length.
 */
export function lastLength(id: string) {
  const v = vp(id)
  if (!v) return null
  const imageId = v.getCurrentImageId()
  const all = (annotation.state.getAnnotations(LengthTool.toolName, v.element) ?? []) as Array<{
    metadata: { referencedImageId?: string }; data: { cachedStats?: Record<string, { length?: number; unit?: string }> }
  }>
  const mine = all.filter((a) => a.metadata.referencedImageId === imageId)
  const stats = mine.at(-1)?.data.cachedStats
  const s = stats && Object.values(stats)[0]
  return s?.length ? { length: s.length, unit: s.unit ?? 'mm' } : null
}

/** Sets the pixel spacing of every image in the panel so the last line measures `trueMm`. */
export function calibrate(id: string, trueMm: number) {
  const v = vp(id)
  const re = engine()
  const m = lastLength(id)
  if (!v || !re || !m || !(trueMm > 0)) return false
  const current = v.getCurrentImageId()
  // the renderer's "scale" is pixels per mm, replacing the file's spacing (not a factor on top of it)
  const prior = metaData.get('calibratedPixelSpacing', current) as { scale?: number } | undefined
  const mmPerPx = prior?.scale ? 1 / prior.scale : (v.getImageData()?.spacing?.[0] ?? 1)
  const pixels = m.length / mmPerPx
  const scale = pixels / trueMm
  // other images of the series first, then the visible one so it re-renders with the new spacing
  for (const imageId of v.getImageIds()) if (imageId !== current) utilities.calibratedPixelSpacingMetadataProvider.add(imageId, { scale, type: Enums.CalibrationTypes.USER })
  toolUtils.calibrateImageSpacing(current, re, scale)
  return true
}

// ------------------------------------------------------------ export
/** The rendered panel (image plus measurements) flattened onto one canvas. */
export async function panelCanvas(element: HTMLElement) {
  const canvas = element.querySelector('canvas')
  const svg = element.querySelector('svg')
  if (!canvas) return null
  const out = document.createElement('canvas')
  out.width = canvas.width; out.height = canvas.height
  const g = out.getContext('2d')!
  g.fillStyle = '#000'
  g.fillRect(0, 0, out.width, out.height)
  g.drawImage(canvas, 0, 0)
  if (svg) {
    const img = new Image()
    const xml = new XMLSerializer().serializeToString(svg)
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml)
    await img.decode().catch(() => {})
    g.drawImage(img, 0, 0, out.width, out.height)
  }
  return out
}

/** Copies the rendered panel (with annotations) to the clipboard as PNG. */
export async function copyImage(element: HTMLElement) {
  const out = await panelCanvas(element)
  if (!out) return false
  const blob = await new Promise<Blob | null>((r) => out.toBlob(r, 'image/png'))
  if (!blob) return false
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
  return true
}

export type ImageFormat = 'jpeg' | 'bmp' | 'png'

export async function encode(canvas: HTMLCanvasElement, format: ImageFormat, quality = 0.92): Promise<Blob> {
  if (format === 'bmp') return encodeBmp(canvas)
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, `image/${format}`, quality))
  if (!blob) throw new Error('The image could not be encoded')
  return blob
}

/** 24-bit uncompressed BMP (the browser has no BMP encoder). */
function encodeBmp(canvas: HTMLCanvasElement): Blob {
  const { width: w, height: h } = canvas
  const px = canvas.getContext('2d')!.getImageData(0, 0, w, h).data
  const row = Math.ceil((w * 3) / 4) * 4
  const size = 54 + row * h
  const buf = new ArrayBuffer(size)
  const dv = new DataView(buf)
  dv.setUint16(0, 0x4d42, true) // "BM"
  dv.setUint32(2, size, true)
  dv.setUint32(10, 54, true)
  dv.setUint32(14, 40, true)
  dv.setInt32(18, w, true)
  dv.setInt32(22, h, true) // positive: rows stored bottom-up
  dv.setUint16(26, 1, true)
  dv.setUint16(28, 24, true)
  dv.setUint32(34, row * h, true)
  dv.setInt32(38, 2835, true); dv.setInt32(42, 2835, true) // 72 dpi
  const out = new Uint8Array(buf)
  for (let y = 0; y < h; y++) {
    const dst = 54 + (h - 1 - y) * row
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4, d = dst + x * 3
      out[d] = px[s + 2]; out[d + 1] = px[s + 1]; out[d + 2] = px[s]
    }
  }
  return new Blob([buf], { type: 'image/bmp' })
}

/** Waits until the panel has drawn the image at `index`. */
export function showImage(id: string, index: number) {
  const v = vp(id)
  if (!v) return Promise.resolve()
  return new Promise<void>((resolve) => {
    const done = () => { v.element.removeEventListener('CORNERSTONE_IMAGE_RENDERED', done); requestAnimationFrame(() => resolve()) }
    v.element.addEventListener('CORNERSTONE_IMAGE_RENDERED', done)
    v.setImageIdIndex(index).catch(() => resolve())
    setTimeout(done, 3000)
  })
}

export function toWL(range: Types.VOIRange) {
  return utilities.windowLevel.toWindowLevel(range.lower, range.upper)
}

export const CT_PRESETS = [
  { key: '2', label: 'Lung', width: 1500, center: -600 },
  { key: '3', label: 'Mediastinum', width: 400, center: 40 },
  { key: '4', label: 'Bone', width: 2000, center: 500 },
  { key: '5', label: 'Brain', width: 80, center: 40 },
  { key: '6', label: 'Abdomen', width: 350, center: 50 },
] as const
