import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// D04: cine plays at the frame rate it shows. Measured in the desktop window, which (unlike a hidden test
// browser tab) is not throttled. Counts image changes on panel 1 over 3 seconds, after a warm-up pass.
const APP = resolve(import.meta.dirname, '..')
const DEMO = join(APP, 'dist', 'demo')
const EXE = process.env.VIEWER_EXE

let app: ElectronApplication | undefined
test.afterEach(async () => { await app?.close().catch(() => {}) })

async function measure(page: Page, seconds: number) {
  return page.evaluate(async (ms) => {
    const el = document.querySelector('[data-viewport-uid="panel-0"]')!
    let last = el.getAttribute('aria-label'), changes = 0
    const t0 = performance.now()
    await new Promise<void>((done) => {
      const obs = new MutationObserver(() => {
        const v = el.getAttribute('aria-label')
        if (v !== last) { last = v; changes++ }
      })
      obs.observe(el, { attributes: true, attributeFilter: ['aria-label'] })
      setTimeout(() => { obs.disconnect(); done() }, ms)
    })
    return changes / ((performance.now() - t0) / 1000)
  }, seconds * 1000)
}

test('D04-H1 cine plays at 15 and 30 frames per second', async () => {
  test.setTimeout(90_000)
  app = await electron.launch({
    executablePath: EXE,
    args: EXE ? [DEMO] : [APP, DEMO],
    env: { ...process.env, VIEWER_USER_DATA: mkdtempSync(join(tmpdir(), 'viewer-test-')) },
  })
  const page = await app.firstWindow()
  const notice = page.getByRole('dialog', { name: 'Before you start' })
  await notice.getByRole('checkbox', { name: 'I understand' }).check()
  await notice.getByRole('button', { name: 'Continue' }).click()
  const p = page.getByRole('img', { name: /image \d+ of \d+$/ }).first()
  await expect(p).toHaveAccessibleName(/image 1 of 80$/, { timeout: 30_000 })

  await p.click()
  await page.keyboard.press('c')
  await expect(page.getByText(/^15 fps$/)).toBeVisible()
  await measure(page, 2) // warm-up: the first pass decodes the images
  const at15 = await measure(page, 3)

  const slider = page.getByRole('slider', { name: 'Frames per second' })
  await slider.focus()
  for (let i = 0; i < 15; i++) await page.keyboard.press('ArrowRight')
  await expect(page.getByText(/^30 fps$/)).toBeVisible()
  await measure(page, 1)
  const at30 = await measure(page, 3)

  console.log(`cine: ${at15.toFixed(1)} fps at 15, ${at30.toFixed(1)} fps at 30`)
  expect(at15).toBeGreaterThan(15 * 0.8)
  expect(at15).toBeLessThan(15 * 1.2)
  expect(at30).toBeGreaterThan(30 * 0.8)
  expect(at30).toBeLessThan(30 * 1.2)
})
