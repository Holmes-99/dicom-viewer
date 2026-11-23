import { join } from 'node:path'
import { test, expect, axe, openDemo, openFiles, panel, panels, press, imageOf } from './helpers'
import { FILES, LONG_NAME, ZIP_PASSWORD } from './fixtures'

const SHOTS = join(import.meta.dirname, '..', '..', 'replica', 'clone-screens')

test.describe('F01 first run', () => {
  test.use({ acceptNotice: false })

  test('F01-N3 notice blocks until ticked, F01-H1 demo opens', async ({ page }) => {
    await page.goto('/')
    const notice = page.getByRole('dialog', { name: 'Before you start' })
    await expect(notice).toBeVisible()
    await axe(page, 'first-run notice')
    const cont = notice.getByRole('button', { name: 'Continue' })
    await expect(cont).toBeDisabled()
    await notice.getByRole('checkbox', { name: 'I understand' }).check()
    await cont.click()
    await expect(notice).toBeHidden()

    await expect(page.getByRole('heading', { name: 'Open a study' })).toBeVisible()
    await axe(page, 'S01 start screen')
    await page.screenshot({ path: join(SHOTS, 'S01.png') })

    await page.getByRole('button', { name: 'Try the demo study' }).click()
    await expect(panel(page, 0)).toHaveAccessibleName(/Axial 2\.5 mm lung, image 1 of 80/, { timeout: 30_000 })
    await expect(page.getByRole('listbox', { name: 'Series' }).getByRole('option')).toHaveCount(4)
    await expect(page.getByText('PHANTOM DEMO')).toBeVisible()
    await axe(page, 'S02 viewer')
    await page.screenshot({ path: join(SHOTS, 'S02.png') })

    // F01-E9 refresh: the study is gone (kept in memory only), the notice is not shown again
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Open a study' })).toBeVisible()
    await expect(page.getByRole('dialog', { name: 'Before you start' })).toBeHidden()
  })
})

test.describe('F01 open files', () => {
  test('F01-H2 + F01-E4 + F01-E5 open files: long UTF-8 name, two patients', async ({ page }) => {
    await openDemo(page)
    // a new pick replaces the session; pick the demo-less other patient plus the codec files
    await openFiles(page, [FILES.other1, FILES.other2, FILES.implicit])
    await expect(panel(page, 0)).toHaveAccessibleName(/Other patient axial, image 1 of 2/)
    // the overlay shows the whole name, accents and emoji intact
    const overlayName = page.getByText(/Ångström-Müller/).first()
    await expect(overlayName).toBeVisible()
    expect(await overlayName.textContent()).toContain('😀')
    expect(LONG_NAME).toHaveLength(64)
    await press(page, 'F4')
    const rows = page.getByRole('dialog').locator('tbody tr')
    await expect(rows).toHaveCount(2)
    await expect(rows.filter({ hasText: 'SYNTH CODEC' })).toHaveCount(1)
    await expect(rows.filter({ hasText: 'Ångström' })).toHaveCount(1)
    await axe(page, 'S03 open series')
    await page.keyboard.press('Escape')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('F01-E1 only non-DICOM files', async ({ page }) => {
    await page.goto('/')
    await openFiles(page, [FILES.text])
    await expect(page.getByText('No images found')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Open a study' })).toBeVisible()
  })

  test('F01-E13 a DICOMDIR picked on its own says to open the disc folder', async ({ page }) => {
    await page.goto('/')
    await openFiles(page, [FILES.dicomdir])
    await expect(page.getByText('No images found')).toBeVisible()
    await expect(page.getByText(/Open the whole disc folder instead/)).toBeVisible()
  })

  test('F01-E2 + F01-E3 mixed with junk and a damaged file', async ({ page }) => {
    await page.goto('/')
    await openFiles(page, [FILES.other1, FILES.other2, FILES.text, FILES.damaged])
    await expect(panel(page, 0)).toHaveAccessibleName(/image 1 of 2/)
    await expect(page.getByText('2 files skipped')).toBeVisible()
  })

  test('F01-E6 implicit VR little endian renders', async ({ page }) => {
    await page.goto('/')
    await openFiles(page, [FILES.implicit])
    await expect(panel(page, 0)).toHaveAccessibleName(/Implicit VR, image 1 of 1/)
    await expect(page.getByText(/^Im 1 \/ 1$/)).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('F01-E7 explicit VR big endian renders or says why not', async ({ page }) => {
    await page.goto('/')
    await openFiles(page, [FILES.bigEndian])
    await expect(page.getByText(/^Im 1 \/ 1$/).or(page.getByText(/cannot decode|could not be displayed/))).toBeVisible()
    await expect(page.getByText(/^Im 1 \/ 1$/), 'big endian should render').toBeVisible()
  })

  test('F01-E8 multi-frame expands to one image per frame', async ({ page }) => {
    await page.goto('/')
    await openFiles(page, [FILES.multiframe])
    await expect(panel(page, 0)).toHaveAccessibleName(/Multiframe, image 1 of 3/)
    await panel(page, 0).click()
    await press(page, 'End')
    await expect(panel(page, 0)).toHaveAccessibleName(/image 3 of 3/)
    await expect(page.getByText(/^Im 3 \/ 3$/)).toBeVisible()
  })

  test('F01-E10 keyboard only', async ({ page }) => {
    await page.goto('/')
    const demo = page.getByRole('button', { name: 'Try the demo study' })
    for (let i = 0; i < 40 && !(await demo.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab')
    await expect(demo).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(panel(page, 0)).toHaveAccessibleName(/image 1 of 80/, { timeout: 30_000 })
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await expect(panel(page, 0)).toHaveAccessibleName(/image 3 of 80/)
  })

  test('F01-E11 smallest window has no sideways scroll', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 })
    await openDemo(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
  })
})

test.describe('F01 ZIP', () => {
  test('F01-H3 plain ZIP', async ({ page }) => {
    await page.goto('/')
    await openFiles(page, [FILES.plainZip], 'Choose ZIP archives to open')
    await expect(panel(page, 0)).toHaveAccessibleName(/Other patient axial, image 1 of 2/)
  })

  test('F01-N1 AES ZIP: wrong password, then the right one', async ({ page }) => {
    await page.goto('/')
    await openFiles(page, [FILES.aesZip], 'Choose ZIP archives to open')
    const dlg = page.getByRole('dialog', { name: 'Password needed' })
    await expect(dlg).toBeVisible()
    await axe(page, 'ZIP password dialog')
    const field = () => page.getByRole('dialog', { name: 'Password needed' }).getByRole('textbox', { name: 'Password' })
    await field().fill('wrong')
    await dlg.getByRole('button', { name: 'Open' }).click()
    await expect(dlg.getByText('That password did not work')).toBeVisible()
    await field().fill(ZIP_PASSWORD)
    await dlg.getByRole('button', { name: 'Open' }).click()
    await expect(panel(page, 0)).toHaveAccessibleName(/Other patient axial, image 1 of 2/)
  })

  test('F01-N2 AES ZIP: cancel', async ({ page }) => {
    await page.goto('/')
    await openFiles(page, [FILES.aesZip], 'Choose ZIP archives to open')
    await page.getByRole('dialog', { name: 'Password needed' }).getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByText(/needs a password/)).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Open a study' })).toBeVisible()
    expect(await panels(page).count()).toBeLessThanOrEqual(1)
    expect(await imageOf(panel(page, 0))).toBeNull()
  })
})
