import { test as base, expect, type Page, type Locator } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { join } from 'node:path'
import { FIX } from './fixtures'

export { expect }
export const fixture = (name: string) => join(FIX, name)

/**
 * Every test fails on a console error or a 5xx response (checked after the test, so the failure names the message).
 * `acceptNotice: false` keeps the first-run notice for the tests that check it.
 */
export const test = base.extend<{ acceptNotice: boolean; logErrorsAllowed: boolean; guard: void }>({
  acceptNotice: [true, { option: true }],
  /** damaged-file tests: a decoder may log an error for a broken image; uncaught page errors still fail */
  logErrorsAllowed: [false, { option: true }],
  guard: [async ({ page, acceptNotice, logErrorsAllowed }, use) => {
    const problems: string[] = []
    page.on('console', (m) => { if (m.type() === 'error' && !logErrorsAllowed) problems.push(`console error: ${m.text()}`) })
    page.on('pageerror', (e) => problems.push(`page error: ${e.message}`))
    page.on('response', (r) => { if (r.status() >= 500) problems.push(`${r.status()} on ${r.url()}`) })
    if (acceptNotice) await page.addInitScript(() => { try { localStorage.setItem('viewer.notice.v1', '1') } catch { /* ignore */ } })
    await use()
    expect(problems, 'console errors / server errors during the test').toEqual([])
  }, { auto: true }],
})

/** Accessibility scan of what is on screen. The renderer's canvas and its drawing layer are excluded (pixels, not UI). */
export async function axe(page: Page, label: string) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('canvas').analyze()
  const v = r.violations.map((x) => `${x.id} (${x.impact}): ${x.nodes.length} × ${x.help} → ${x.nodes.slice(0, 3).map((nd) => nd.target.join(' ')).join(' | ')}`)
  expect(v, `axe violations on ${label}`).toEqual([])
}

export const panels = (page: Page) => page.getByRole('img', { name: /(image \d+ of \d+|Empty panel)$/ })
export const panel = (page: Page, i: number) => panels(page).nth(i)

/** Current image number of a panel, from its accessible name ("…, image 12 of 80"). */
export async function imageOf(p: Locator) {
  const m = /image (\d+) of (\d+)$/.exec((await p.getAttribute('aria-label')) ?? '')
  return m ? { index: Number(m[1]), total: Number(m[2]) } : null
}

export async function openDemo(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Try the demo study' }).click()
  await expect(panel(page, 0)).toHaveAccessibleName(/Axial 2\.5 mm lung, image 1 of 80/, { timeout: 30_000 })
  await expect(page.getByText(/^Im 1 \/ 80$/)).toBeVisible()
}

export async function openFiles(page: Page, names: string[], input = 'Choose files to open') {
  await page.getByLabel(input).setInputFiles(names.map(fixture))
}

/** Presses a key with the focus outside inputs, as the viewer's shortcuts expect. */
export async function press(page: Page, key: string) {
  await page.keyboard.press(key)
}

export async function center(p: Locator) {
  const b = (await p.boundingBox())!
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, h: b.height }
}

export async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, button: 'left' | 'right' = 'left') {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down({ button })
  await page.mouse.move(to.x, to.y, { steps: 8 })
  await page.mouse.up({ button })
}

/** Grey value (0-255) of the rendered image at a point relative to the panel (0..1). */
export async function pixel(p: Locator, fx = 0.5, fy = 0.5) {
  return p.evaluate((el, [fx, fy]) => {
    const c = el.querySelector('canvas') as HTMLCanvasElement
    const t = document.createElement('canvas'); t.width = c.width; t.height = c.height
    const g = t.getContext('2d')!; g.drawImage(c, 0, 0)
    return g.getImageData(Math.floor(c.width * fx), Math.floor(c.height * fy), 1, 1).data[0]
  }, [fx, fy] as const)
}

/** Text of the measurement labels drawn on a panel. */
export async function labels(p: Locator) {
  return p.evaluate((el) => [...el.querySelectorAll('svg text')].map((t) => t.textContent ?? '').filter(Boolean))
}

export async function setLayout(page: Page, cols: number, rows = 1) {
  await page.getByRole('button', { name: 'Layout' }).click()
  const grid = page.getByRole('grid', { name: 'Panel layout' })
  await grid.getByRole('gridcell').nth((rows - 1) * 5 + (cols - 1)).click()
  await page.keyboard.press('Escape')
  await expect(panels(page)).toHaveCount(rows * cols)
}

/** Puts a series into a panel with F4 + search + Enter. */
export async function showSeries(page: Page, panelIndex: number, search: string) {
  await panel(page, panelIndex).click()
  await press(page, 'F4')
  const box = page.getByRole('textbox', { name: 'Search series' })
  await box.fill(search)
  await expect(page.getByRole('dialog').locator('tbody tr')).toHaveCount(1)
  await box.press('Enter')
  await expect(page.getByRole('dialog')).toBeHidden()
}
