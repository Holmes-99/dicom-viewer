import { utilities, type Types } from '@cornerstonejs/core'
import { stackViewport } from './engine'

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

/** Copies the rendered panel (with annotations) to the clipboard as PNG. */
export async function copyImage(element: HTMLElement) {
  const canvas = element.querySelector('canvas')
  const svg = element.querySelector('svg')
  if (!canvas) return false
  const out = document.createElement('canvas')
  out.width = canvas.width; out.height = canvas.height
  const g = out.getContext('2d')!
  g.drawImage(canvas, 0, 0)
  if (svg) {
    const img = new Image()
    const xml = new XMLSerializer().serializeToString(svg)
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml)
    await img.decode().catch(() => {})
    g.drawImage(img, 0, 0, out.width, out.height)
  }
  const blob = await new Promise<Blob | null>((r) => out.toBlob(r, 'image/png'))
  if (!blob) return false
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
  return true
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
