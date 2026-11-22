import { test, expect, openDemo, panel, press, imageOf, center, drag, pixel, showSeries } from './helpers'

test.describe('F02 adjust the image', () => {
  test.beforeEach(async ({ page }) => { await openDemo(page) })

  test('F02-H1 mouse wheel scrolls and Z changes', async ({ page }) => {
    const p = panel(page, 0)
    const c = await center(p)
    await page.mouse.move(c.x, c.y)
    for (let i = 0; i < 5; i++) await page.mouse.wheel(0, 120)
    await expect.poll(async () => (await imageOf(p))!.index).toBeGreaterThan(1)
    await expect(page.getByText(/^Z 98\.8 mm$/)).toHaveCount(0)
  })

  test('F02-H2 window presets from the keyboard', async ({ page }) => {
    await panel(page, 0).click()
    await press(page, '2')
    await expect(page.getByText(/^W 1500 L -600$/)).toBeVisible()
    await press(page, '3')
    await expect(page.getByText(/^W 400 L 40$/)).toBeVisible()
  })

  test('F02-H3 zoom tool, then Esc resets', async ({ page }) => {
    const p = panel(page, 0)
    await expect(page.getByText(/^Zoom 100%$/)).toBeVisible()
    await press(page, 'z')
    const c = await center(p)
    await drag(page, { x: c.x, y: c.y + 60 }, { x: c.x, y: c.y - 60 })
    await expect(page.getByText(/^Zoom 100%$/)).toHaveCount(0)
    await press(page, 'Escape')
    await expect(page.getByText(/^Zoom 100%$/)).toBeVisible()
  })

  test('F02-H4 invert flips a bright pixel to dark and back', async ({ page }) => {
    const p = panel(page, 0)
    // the centre of the lung slice is soft tissue (bright in the lung window)
    await expect.poll(() => pixel(p)).toBeGreaterThan(150)
    const before = await pixel(p)
    await press(page, 'i')
    await expect.poll(() => pixel(p)).toBeLessThan(255 - before + 20)
    await press(page, 'i')
    await expect.poll(() => pixel(p)).toBeGreaterThan(150)
  })

  test('F02-H5 rotate, flip, reset', async ({ page }) => {
    const p = panel(page, 0)
    // a point off-centre on the left: the spine sits at the bottom of the image, so rotating moves it
    const probe = () => pixel(p, 0.5, 0.78)
    const start = await probe()
    await press(page, 'Control+r')
    await expect.poll(probe).not.toBe(start)
    await press(page, 'Control+h')
    await press(page, 'Escape')
    await expect.poll(probe).toBe(start)
  })

  test('F02-H6 cine plays and pauses', async ({ page }) => {
    const p = panel(page, 0)
    await press(page, 'c')
    await expect(page.getByRole('toolbar', { name: 'Cine' })).toBeVisible()
    await expect.poll(async () => (await imageOf(p))!.index, { timeout: 10_000 }).toBeGreaterThan(3)
    await press(page, 'c')
    await expect(page.getByRole('button', { name: 'Play cine' })).toBeVisible()
    // a frame already being drawn may still land; after that the image must stay put
    await page.waitForTimeout(400)
    const paused = (await imageOf(p))!.index
    await page.waitForTimeout(1000)
    expect((await imageOf(p))!.index).toBe(paused)
    await page.getByRole('button', { name: 'Close cine' }).click()
    await expect(page.getByRole('toolbar', { name: 'Cine' })).toBeHidden()
  })

  test('F02-E1 Home, End and the end of the stack', async ({ page }) => {
    const p = panel(page, 0)
    await p.click()
    await press(page, 'End')
    await expect(p).toHaveAccessibleName(/image 80 of 80/)
    await press(page, 'ArrowDown')
    await expect(p).toHaveAccessibleName(/image 80 of 80/)
    await press(page, 'Home')
    await expect(p).toHaveAccessibleName(/image 1 of 80/)
  })

  test('F02-E2 overlay off, hide patient data', async ({ page }) => {
    await press(page, 'Control+t')
    await expect(page.getByText('PHANTOM DEMO')).toBeHidden()
    await press(page, 'Control+t')
    await page.getByRole('button', { name: 'Copy image options' }).click()
    await page.getByRole('menuitemcheckbox', { name: 'Hide patient data' }).click()
    await expect(page.getByText('PHANTOM DEMO')).toBeHidden()
    await expect(page.getByText('Patient data hidden')).toBeVisible()
  })

  test('F02-E3 cine on a single image', async ({ page }) => {
    await showSeries(page, 0, 'Scout')
    await expect(panel(page, 0)).toHaveAccessibleName(/Scout, image 1 of 1/)
    await press(page, 'c')
    await expect(page.getByText('Nothing to play')).toBeVisible()
  })
})
