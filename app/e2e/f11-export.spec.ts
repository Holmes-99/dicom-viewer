import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { test, expect, axe, openDemo, press } from './helpers'

const SHOTS = join(import.meta.dirname, '..', '..', 'replica', 'clone-screens')

async function exportAs(page: Page, format: 'JPEG' | 'BMP', name?: string) {
  await press(page, 'Control+s')
  const dlg = page.getByRole('dialog', { name: 'Export images' })
  await expect(dlg).toBeVisible()
  await dlg.getByRole('radio', { name: format }).check()
  if (name !== undefined) await dlg.getByLabel('File name').fill(name)
  const [dl] = await Promise.all([page.waitForEvent('download'), dlg.getByRole('button', { name: 'Export' }).click()])
  return { dl, bytes: readFileSync(await dl.path()) }
}

test.describe('F11 export, copy, tags', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await openDemo(page)
  })

  test('F11-H1 export the current image as JPEG', async ({ page }) => {
    await press(page, 'Control+s')
    await axe(page, 'S13 export dialog')
    await page.screenshot({ path: join(SHOTS, 'S13.png') })
    await page.keyboard.press('Escape')
    const { dl, bytes } = await exportAs(page, 'JPEG')
    expect(dl.suggestedFilename()).toBe('CT_Se3.jpg')
    expect([...bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff])
    await expect(page.getByText('Saved CT_Se3.jpg')).toBeVisible()
  })

  test('F11-H2 export as BMP', async ({ page }) => {
    // Playwright's Chromium cancels blob downloads of a few MB (a 5 MB blob from a bare page too), and an
    // uncompressed BMP of the panel is that big. Check the file the page hands to the browser instead.
    await page.evaluate(() => {
      const orig = URL.createObjectURL
      URL.createObjectURL = (b: Blob | MediaSource) => { (window as unknown as { lastBlob: unknown }).lastBlob = b; return orig(b) }
    })
    await press(page, 'Control+s')
    const dlg = page.getByRole('dialog', { name: 'Export images' })
    await dlg.getByRole('radio', { name: 'BMP' }).check()
    const [dl] = await Promise.all([page.waitForEvent('download'), dlg.getByRole('button', { name: 'Export' }).click()])
    expect(dl.suggestedFilename()).toBe('CT_Se3.bmp')
    const info = await page.evaluate(async () => {
      const b = (window as unknown as { lastBlob: Blob }).lastBlob
      const v = new DataView(await b.arrayBuffer())
      return { magic: String.fromCharCode(v.getUint8(0), v.getUint8(1)), declared: v.getUint32(2, true), size: b.size, w: v.getInt32(18, true), bpp: v.getUint16(28, true) }
    })
    expect(info.magic).toBe('BM')
    expect(info.declared).toBe(info.size)
    expect(info.bpp).toBe(24)
    expect(info.w).toBeGreaterThan(100)
    await expect(page.getByText('Saved CT_Se3.bmp')).toBeVisible()
  })

  test('F11-E1 unsafe characters in the file name', async ({ page }) => {
    const { dl } = await exportAs(page, 'JPEG', 'a/b:c*')
    expect(dl.suggestedFilename()).toBe('a_b_c_.jpg')
  })

  test('F11-H3 tags: search and copy a value', async ({ page }) => {
    await press(page, 'F2')
    const dlg = page.getByRole('dialog', { name: 'DICOM tags' })
    await expect(dlg).toBeVisible()
    await axe(page, 'S12 DICOM tags')
    await page.screenshot({ path: join(SHOTS, 'S12.png') })
    await dlg.getByRole('textbox', { name: 'Search tags' }).fill('pixel spacing')
    const row = dlg.locator('tbody tr').filter({ hasText: 'Pixel Spacing' })
    await expect(row).toHaveCount(1)
    await row.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByText('Copied: Pixel Spacing')).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('1.25\\1.25')
  })

  test('F11-E3 tags search with no match', async ({ page }) => {
    await press(page, 'F2')
    await page.getByRole('textbox', { name: 'Search tags' }).fill('zzz')
    await expect(page.getByText('Nothing matches “zzz”')).toBeVisible()
  })

  test('F11-H4 copy the image to the clipboard', async ({ page }) => {
    await press(page, 'Control+c')
    await expect(page.getByText('Image copied to the clipboard')).toBeVisible()
    const types = await page.evaluate(async () => (await navigator.clipboard.read()).flatMap((i) => i.types))
    expect(types).toContain('image/png')
  })
})
