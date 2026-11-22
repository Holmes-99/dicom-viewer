import { imageLoader, type Types } from '@cornerstonejs/core'

/** Draws a decoded image into a small square canvas, fitted and centred, using the file's own window. */
export async function drawThumbnail(canvas: HTMLCanvasElement, imageId: string, size = 92) {
  const img = (await imageLoader.loadAndCacheImage(imageId)) as Types.IImage
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const S = Math.round(size * dpr)
  canvas.width = S
  canvas.height = S
  const g = canvas.getContext('2d')!
  g.fillStyle = '#000'
  g.fillRect(0, 0, S, S)

  const { width: w, height: h } = img
  const src = document.createElement('canvas')
  src.width = w
  src.height = h
  const sg = src.getContext('2d')!
  const out = sg.createImageData(w, h)
  const px = img.getPixelData()
  // the loader usually pre-scales pixels to modality units (HU); only rescale raw values
  const prescaled = Boolean(img.preScale?.scaled)
  const slope = prescaled ? 1 : img.slope ?? 1
  const intercept = prescaled ? 0 : img.intercept ?? 0

  if (img.color) {
    const step = px.length / (w * h) // 3 (RGB) or 4 (RGBA)
    for (let i = 0, o = 0; o < out.data.length; i += step, o += 4) {
      out.data[o] = px[i]; out.data[o + 1] = px[i + 1]; out.data[o + 2] = px[i + 2]; out.data[o + 3] = 255
    }
  } else {
    let wc = Array.isArray(img.windowCenter) ? img.windowCenter[0] : img.windowCenter
    let ww = Array.isArray(img.windowWidth) ? img.windowWidth[0] : img.windowWidth
    if (!ww || !Number.isFinite(ww)) {
      const lo = img.minPixelValue * slope + intercept
      const hi = img.maxPixelValue * slope + intercept
      wc = (lo + hi) / 2
      ww = Math.max(1, hi - lo)
    }
    const low = (wc as number) - ww / 2
    const invert = img.photometricInterpretation === 'MONOCHROME1'
    for (let i = 0, o = 0; i < px.length; i++, o += 4) {
      let v = ((px[i] * slope + intercept - low) / ww) * 255
      v = v < 0 ? 0 : v > 255 ? 255 : v
      if (invert) v = 255 - v
      out.data[o] = out.data[o + 1] = out.data[o + 2] = v
      out.data[o + 3] = 255
    }
  }
  sg.putImageData(out, 0, 0)
  const scale = Math.min(S / w, S / h)
  const dw = w * scale, dh = h * scale
  g.imageSmoothingQuality = 'high'
  g.drawImage(src, (S - dw) / 2, (S - dh) / 2, dw, dh)
}
