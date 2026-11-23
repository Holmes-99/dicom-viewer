import type { Locator } from '@playwright/test'
import { test, expect, openFiles, panel } from './helpers'
import { CODECS } from './codecs'

// F01-E12: every compressed transfer syntax we claim, plus colour ultrasound, decodes to the right picture.
// The test images are a disc on a background (e2e/codecs.ts); the check reads the rendered pixels.

/** RGB of the rendered image at a point (fractions of the panel) */
async function rgbAt(p: Locator, fx: number, fy: number) {
  return p.evaluate((el, [fx, fy]) => {
    const c = el.querySelector('canvas') as HTMLCanvasElement
    const t = document.createElement('canvas'); t.width = c.width; t.height = c.height
    const g = t.getContext('2d')!; g.drawImage(c, 0, 0)
    const d = g.getImageData(Math.floor(c.width * fx), Math.floor(c.height * fy), 1, 1).data
    return [d[0], d[1], d[2]]
  }, [fx, fy] as const)
}

test.describe('F01-E12 codecs', () => {
  for (const c of CODECS) {
    test(`${c.desc} (${c.ts})`, async ({ page }) => {
      await page.goto('/')
      await openFiles(page, [c.file])
      const p = panel(page, 0)
      await expect(p).toHaveAccessibleName(new RegExp(`${c.desc}, image 1 of 1`))
      await expect(page.getByText(/^Im 1 \/ 1$/)).toBeVisible()
      await expect(page.getByRole('alert')).toHaveCount(0)
      // the picture fills the panel's height: centre is inside the disc, 12 % from the top is background
      const look = ([r, g, b]: number[]) =>
        r > 170 && g > 170 && b > 170 ? 'white' : r < 60 && g < 60 && b < 60 ? 'black'
          : r > 170 && g < 80 && b < 80 ? 'red' : b > 170 && r < 80 && g < 80 ? 'blue' : `other ${r},${g},${b}`
      await expect.poll(async () => look(await rgbAt(p, 0.5, 0.5)), { message: 'centre of the disc' }).toBe(c.kind === 'grey' ? 'white' : 'red')
      expect(look(await rgbAt(p, 0.5, 0.12)), 'background').toBe(c.kind === 'grey' ? 'black' : 'blue')
    })
  }
})
