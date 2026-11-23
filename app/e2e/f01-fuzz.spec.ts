import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect, panel, press } from './helpers'
import { FIX, FILES } from './fixtures'
import { CODECS } from './codecs'
import { buildSession, inflateIfNeeded, parseHeader, type Parsed } from '../src/data/index-files'

// F01-E14: damaged files. Seeded, so a failure always reproduces; the seed and case number are in the message.
// Part 1 runs thousands of damaged headers through the reader and the series builder (no browser).
// Part 2 opens a batch of damaged files in the viewer and pages through every image, so the decoders see them too.
const SEED = 20261123
const SOURCES = [FILES.other1, FILES.implicit, FILES.bigEndian, FILES.multiframe, ...CODECS.map((c) => c.file)]
  .map((f) => new Uint8Array(readFileSync(join(FIX, f))))

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** one damaged file: truncated, bytes flipped, length fields broken, chunks repeated, or noise behind a valid preamble */
function damage(r: () => number, i: number): { bytes: Uint8Array; how: string } {
  const src = SOURCES[i % SOURCES.length]
  const at = (lo = 132) => lo + Math.floor(r() * Math.max(1, src.length - lo))
  const b = src.slice()
  switch (Math.floor(r() * 6)) {
    case 0: { const n = at(0); return { bytes: src.slice(0, n), how: `truncated at ${n}` } }
    case 1: {
      const k = 1 + Math.floor(r() * 24)
      for (let j = 0; j < k; j++) b[at()] = Math.floor(r() * 256)
      return { bytes: b, how: `${k} bytes changed` }
    }
    case 2: {
      const p = at() & ~1
      const v = [0xffffffff, 0x7fffffff, 0, 0xfffe, 1][Math.floor(r() * 5)]
      new DataView(b.buffer).setUint32(Math.min(p, b.length - 4), v >>> 0, true)
      return { bytes: b, how: `length-like word ${v.toString(16)} at ${p}` }
    }
    case 3: {
      const p = at(), n = 1 + Math.floor(r() * 64)
      const out = new Uint8Array(b.length + n); out.set(b.subarray(0, p)); out.set(b.subarray(p - Math.min(p, n), p), p); out.set(b.subarray(p), p + n)
      return { bytes: out, how: `${n} bytes repeated at ${p}` }
    }
    case 4: {
      const out = new Uint8Array(132 + Math.floor(r() * 4000)); out.set([68, 73, 67, 77], 128)
      for (let j = 132; j < out.length; j++) out[j] = Math.floor(r() * 256)
      return { bytes: out, how: 'noise after DICM' }
    }
    default: {
      const p = at() & ~1, out = b.slice(0, p + 8)
      out.set([0xe0, 0x7f, 0x10, 0x00, 0x4f, 0x42, 0x00, 0x00].slice(0, out.length - p), p)
      return { bytes: out, how: `pixel data tag forged at ${p}` }
    }
  }
}

test.describe('F01-E14 damaged files', () => {
  test.use({ logErrorsAllowed: true })

  test('headers: 3000 damaged files never crash the reader or the series builder', async () => {
    test.setTimeout(120_000)
    const r = rng(SEED)
    let read = 0
    for (let i = 0; i < 3000; i++) {
      const { bytes, how } = damage(r, i)
      const name = `fuzz_${i}.dcm`
      const started = Date.now()
      let parsed: Parsed[] = []
      try {
        const file = await inflateIfNeeded(new File([bytes], name))
        const ds = await parseHeader(file)
        parsed = [{ file, imageId: `fuzz:${i}`, ds }]
        read++
      } catch { /* refused: that is the expected outcome for most of them */ }
      // what got through must still build a session, and nothing may take long
      expect(() => buildSession(parsed, []), `seed ${SEED} case ${i} (${how})`).not.toThrow()
      expect(Date.now() - started, `seed ${SEED} case ${i} (${how}) took too long`).toBeLessThan(2000)
    }
    expect(read, 'some damaged files still have readable headers').toBeGreaterThan(100)
  })

  test('viewer: 120 damaged files open, every image is shown or refused, the app keeps working', async ({ page }) => {
    test.setTimeout(180_000)
    const r = rng(SEED + 1)
    const files = Array.from({ length: 120 }, (_, i) => ({ name: `fuzz_${i}.dcm`, mimeType: 'application/dicom', buffer: Buffer.from(damage(r, i).bytes) }))
    await page.goto('/')
    await page.getByLabel('Choose files to open').setInputFiles(files)
    await expect(page.getByText(/files skipped|No images found/)).toBeVisible({ timeout: 60_000 })
    const options = page.getByRole('listbox', { name: 'Series' }).getByRole('option')
    const count = await options.count()
    for (let i = 0; i < count; i++) {
      await options.nth(i).dblclick()
      await panel(page, 0).click()
      for (const key of ['End', 'Home', 'PageDown']) await press(page, key)
    }
    // still responsive: the demo study opens and shows its first image
    await page.goto('/')
    await page.getByRole('button', { name: 'Try the demo study' }).click()
    await expect(panel(page, 0)).toHaveAccessibleName(/image 1 of 80/, { timeout: 30_000 })
  })
})
