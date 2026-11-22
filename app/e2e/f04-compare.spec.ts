import { join } from 'node:path'
import { test, expect, openDemo, openFiles, panel, panels, press, imageOf, setLayout, showSeries } from './helpers'
import { FILES } from './fixtures'

const zOf = async (p: import('@playwright/test').Locator) => p.locator('xpath=..').getByText(/^Z -?[\d.]+ mm$/).textContent()
const refLine = (p: import('@playwright/test').Locator) => p.evaluate((el) => {
  const l = el.querySelector('svg line')
  return l ? Math.round(Number(l.getAttribute('y1'))) : null
})

test.describe('F04 compare series', () => {
  test.beforeEach(async ({ page }) => { await openDemo(page) })

  test('F04-H1 + F04-H2 two axials side by side stay in sync', async ({ page }) => {
    await setLayout(page, 2)
    await showSeries(page, 1, 'mediastinum')
    await expect(panel(page, 1)).toHaveAccessibleName(/mediastinum, image 1 of 80/)
    await panel(page, 0).click()
    for (let i = 0; i < 12; i++) await press(page, 'ArrowDown')
    await expect(panel(page, 0)).toHaveAccessibleName(/image 13 of 80/)
    await expect(panel(page, 1)).toHaveAccessibleName(/image 13 of 80/)
    expect(await zOf(panel(page, 1))).toBe(await zOf(panel(page, 0)))
    await page.screenshot({ path: join(import.meta.dirname, '..', '..', 'replica', 'clone-screens', 'S02-sync.png') })
  })

  test('F04-H3 reference line follows the coronal slice', async ({ page }) => {
    await setLayout(page, 2)
    await showSeries(page, 1, 'Coronal')
    await panel(page, 1).click()
    await expect.poll(() => refLine(panel(page, 0))).not.toBeNull()
    const before = await refLine(panel(page, 0))
    for (let i = 0; i < 10; i++) await press(page, 'ArrowDown')
    await expect(panel(page, 1)).toHaveAccessibleName(/image 11 of 48/)
    await expect.poll(() => refLine(panel(page, 0))).not.toBe(before)
    expect(await refLine(panel(page, 1)), 'no line on the active panel itself').toBeNull()
  })

  test('F04-E1 sync off keeps panels independent', async ({ page }) => {
    await setLayout(page, 2)
    await showSeries(page, 1, 'mediastinum')
    await page.getByRole('button', { name: 'Auto sync: on', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Auto sync: off', exact: true })).toBeVisible()
    await panel(page, 0).click()
    for (let i = 0; i < 5; i++) await press(page, 'ArrowDown')
    await expect(panel(page, 0)).toHaveAccessibleName(/image 6 of 80/)
    await expect(panel(page, 1)).toHaveAccessibleName(/image 1 of 80/)
  })

  test('F04-E2 drag a thumbnail onto a panel', async ({ page }) => {
    await setLayout(page, 2)
    const thumb = page.getByRole('listbox', { name: 'Series' }).getByRole('option').filter({ hasText: 'Coronal' })
    await thumb.dragTo(panel(page, 1))
    await expect(panel(page, 1)).toHaveAccessibleName(/Coronal 4 mm, image 1 of 48/)
  })

  test('F04-E3 5x5 layout', async ({ page }) => {
    await setLayout(page, 5, 5)
    await expect(panels(page)).toHaveCount(25)
    await expect(page.getByText('Drop a series here')).toHaveCount(21)
  })

  test('F04-E4 F4 search with no match', async ({ page }) => {
    await press(page, 'F4')
    await page.getByRole('textbox', { name: 'Search series' }).fill('zzz')
    await expect(page.getByText('Nothing matches “zzz”')).toBeVisible()
  })

  test('F04-E5 a different patient is not synced', async ({ page }) => {
    // open the demo plus the other patient's series together
    await page.goto('/')
    const demo = ['s3_001.dcm', 's3_002.dcm', 's3_003.dcm', 's3_004.dcm'].map((n) => `../../public/demo/${n}`)
    await openFiles(page, [...demo, FILES.other1, FILES.other2])
    await setLayout(page, 2)
    await showSeries(page, 1, 'Other patient')
    await panel(page, 0).click()
    await press(page, 'ArrowDown')
    await expect.poll(async () => (await imageOf(panel(page, 0)))!.index).toBe(2)
    await expect(panel(page, 1)).toHaveAccessibleName(/Other patient axial, image 1 of 2/)
  })
})
