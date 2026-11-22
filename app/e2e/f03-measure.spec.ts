import type { Page } from '@playwright/test'
import { test, expect, axe, openDemo, panel, press, center, drag, labels, showSeries } from './helpers'

/** Screen point for a patient position (mm from the image centre) on the fitted 320 mm demo slice. */
async function at(page: Page, xMm: number, yMm: number) {
  const c = await center(panel(page, 0))
  const s = Math.min(c.w, c.h) / 320
  return { x: c.x + xMm * s, y: c.y + yMm * s }
}

async function drawLine(page: Page) {
  await press(page, 'l')
  await drag(page, await at(page, -80, 40), await at(page, 60, 40))
  await expect.poll(() => labels(panel(page, 0))).toContainEqual(expect.stringMatching(/mm/))
}

async function openCalibrate(page: Page) {
  await page.getByRole('button', { name: 'Length options' }).click()
  await page.getByRole('menuitem', { name: 'Calibrate…' }).click()
  return page.getByRole('dialog', { name: 'Calibrate length' })
}

test.describe('F03 measure', () => {
  test.beforeEach(async ({ page }) => { await openDemo(page) })

  test('F03-H1 length in mm', async ({ page }) => {
    await drawLine(page)
    const text = (await labels(panel(page, 0))).find((t) => /mm/.test(t))!
    // 140 mm apart on the phantom
    expect(Number(/([\d.]+) mm/.exec(text)![1])).toBeGreaterThan(130)
    expect(Number(/([\d.]+) mm/.exec(text)![1])).toBeLessThan(150)
  })

  test('F03-H2 ellipse in the lung reads about -850 HU', async ({ page }) => {
    await press(page, 'e')
    await drag(page, await at(page, 45, -20), await at(page, 65, 0))
    await expect.poll(async () => (await labels(panel(page, 0))).join(' ')).toMatch(/Mean/)
    const all = (await labels(panel(page, 0))).join(' ')
    const mean = Number(/Mean:?\s*(-?[\d.]+)/.exec(all)![1])
    expect(mean).toBeGreaterThan(-880)
    expect(mean).toBeLessThan(-820)
    expect(all).toMatch(/HU/)
  })

  test('F03-H3 angle in degrees', async ({ page }) => {
    await press(page, 'a')
    const a = await at(page, -60, 40), b = await at(page, 0, 0), c = await at(page, 60, 40)
    await drag(page, a, b)
    await page.mouse.move(c.x, c.y, { steps: 5 })
    await page.mouse.click(c.x, c.y)
    await expect.poll(async () => (await labels(panel(page, 0))).join(' ')).toMatch(/°/)
  })

  test('F03-H4 calibrate a line to 70 mm', async ({ page }) => {
    await drawLine(page)
    const dlg = await openCalibrate(page)
    await axe(page, 'calibrate dialog')
    await dlg.getByLabel('Real length (mm)').fill('70')
    await dlg.getByRole('button', { name: 'Apply' }).click()
    await expect(dlg).toBeHidden()
    await expect.poll(async () => (await labels(panel(page, 0))).join(' ')).toMatch(/^70\.0 mm|\b70\.0 mm/)
  })

  test('F03-E1 calibrate without a line explains how', async ({ page }) => {
    const dlg = await openCalibrate(page)
    await expect(dlg.getByText(/Draw a line with the Length tool/)).toBeVisible()
    await expect(dlg.getByRole('button', { name: 'Apply' })).toBeDisabled()
  })

  test('F03-E2 bad calibration input', async ({ page }) => {
    await drawLine(page)
    const dlg = await openCalibrate(page)
    const field = dlg.getByLabel('Real length (mm)')
    for (const bad of ['0', 'abc']) {
      await field.fill(bad)
      await expect(dlg.getByText('Enter a length greater than 0.')).toBeVisible()
      await expect(dlg.getByRole('button', { name: 'Apply' })).toBeDisabled()
    }
  })

  test('F03-N1 no pixel spacing: length in px', async ({ page }) => {
    await showSeries(page, 0, 'Scout')
    await press(page, 'l')
    const c = await center(panel(page, 0))
    await drag(page, { x: c.x - 80, y: c.y }, { x: c.x + 80, y: c.y })
    await expect.poll(async () => (await labels(panel(page, 0))).join(' ')).toMatch(/px/)
    expect((await labels(panel(page, 0))).join(' ')).not.toMatch(/\bmm\b/)
  })
})
