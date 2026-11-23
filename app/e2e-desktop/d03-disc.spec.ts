import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import dicomParser, { type DataSet } from 'dicom-parser'
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// D3: Export → Prepare disc folder. Needs `npm run build` first; with VIEWER_EXE (npm run test:packaged)
// it also checks the viewer copied onto the disc, started from there with nothing to open.
const APP = resolve(import.meta.dirname, '..')
const DEMO = join(APP, 'dist', 'demo')
const EXE = process.env.VIEWER_EXE
const DEMO_IMAGES = (JSON.parse(readFileSync(join(DEMO, 'index.json'), 'utf8')) as string[]).length

const apps: ElectronApplication[] = []
test.afterEach(async () => { for (const a of apps.splice(0)) await a.close().catch(() => {}) })

async function launch(args: string[], executablePath = EXE) {
  const app = await electron.launch({
    executablePath,
    args: executablePath ? args : [APP, ...args],
    env: { ...process.env, VIEWER_USER_DATA: mkdtempSync(join(tmpdir(), 'viewer-test-')) },
  })
  apps.push(app)
  const page = await app.firstWindow()
  const notice = page.getByRole('dialog', { name: 'Before you start' })
  await notice.getByRole('checkbox', { name: 'I understand' }).check()
  await notice.getByRole('button', { name: 'Continue' }).click()
  return { app, page }
}
const firstPanel = (page: Page) => page.getByRole('img', { name: /image \d+ of \d+$/ }).first()
const tag = (ds: DataSet, t: string) => (ds.string(t) ?? '').trim()

function walkFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walkFiles(p) : [p] })
}

async function prepareDisc(app: ElectronApplication, page: Page, folder: string) {
  await app.evaluate(({ dialog }, dir) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] }) }, folder)
  await page.getByRole('button', { name: 'Export images options' }).click()
  await page.getByRole('menuitem', { name: 'Prepare disc folder…' }).click()
  const dlg = page.getByRole('dialog', { name: 'Prepare disc folder' })
  await expect(dlg.getByText(`1 patient · 1 study · 4 series · ${DEMO_IMAGES} images`)).toBeVisible()
  await dlg.getByRole('button', { name: 'Choose folder…' }).click()
  return dlg
}

test('D03-H1 the disc folder has every image, a valid DICOMDIR and a START HERE note, and opens again', async () => {
  test.setTimeout(180_000)
  const { app, page } = await launch([DEMO])
  await expect(firstPanel(page)).toHaveAccessibleName(/image 1 of 80$/, { timeout: 30_000 })
  const disc = mkdtempSync(join(tmpdir(), 'viewer-disc-'))
  await prepareDisc(app, page, disc)
  // whichever comes first, so a failure shows its message instead of a timeout
  const outcome = page.getByText(/^(Disc folder ready|The disc folder is incomplete)$/)
  await expect(outcome).toBeVisible({ timeout: 150_000 })
  const failed = page.getByText('The disc folder is incomplete')
  if (await failed.isVisible()) throw new Error(`disc failed: ${await failed.locator('xpath=..').innerText()}`)
  await expect(page.getByText(/Fits on a CD\./)).toBeVisible()

  // the images, unchanged, under 8-character names
  const images = walkFiles(join(disc, 'DICOM'))
  expect(images).toHaveLength(DEMO_IMAGES)
  for (const f of images) expect(f.slice(disc.length + 1).split(/[\\/]/).every((c) => /^[A-Z0-9_]{1,8}$/.test(c))).toBe(true)
  expect(readFileSync(join(disc, 'START HERE.txt'), 'utf8')).toMatch(/not a certified medical device/)

  // DICOMDIR: parse it and follow every link from the root, the way another viewer would
  const bytes = new Uint8Array(readFileSync(join(disc, 'DICOMDIR')))
  const dir = dicomParser.parseDicom(bytes)
  expect(tag(dir, 'x00020002')).toBe('1.2.840.10008.1.3.10')
  const items = dir.elements.x00041220.items!
  const at = new Map(items.map((it) => [it.dataOffset - 8, it.dataSet!]))
  const counts: Record<string, number> = {}
  const sops = new Set<string>()
  const follow = (offset: number, depth: number) => {
    for (let o = offset; o; ) {
      const r = at.get(o)
      expect(r, `a record starts at offset ${o}`).toBeTruthy()
      const type = tag(r!, 'x00041430')
      counts[type] = (counts[type] ?? 0) + 1
      expect(type).toBe(['PATIENT', 'STUDY', 'SERIES', 'IMAGE'][depth])
      if (type === 'IMAGE') {
        const file = join(disc, ...tag(r!, 'x00041500').split('\\'))
        expect(existsSync(file), file).toBe(true)
        const img = dicomParser.parseDicom(new Uint8Array(readFileSync(file)), { untilTag: 'x7fe00010' })
        expect(tag(img, 'x00080018')).toBe(tag(r!, 'x00041511'))
        expect(tag(img, 'x00080016')).toBe(tag(r!, 'x00041510'))
        sops.add(tag(r!, 'x00041511'))
      }
      const lower = r!.uint32('x00041420') ?? 0
      if (lower) follow(lower, depth + 1)
      o = r!.uint32('x00041400') ?? 0
    }
  }
  follow(dir.uint32('x00041200')!, 0)
  expect(counts).toEqual({ PATIENT: 1, STUDY: 1, SERIES: 4, IMAGE: DEMO_IMAGES })
  expect(sops.size).toBe(DEMO_IMAGES)
  expect(items).toHaveLength(1 + 1 + 4 + DEMO_IMAGES)

  // a folder that is not empty is refused
  const dlg = await prepareDisc(app, page, disc)
  await expect(dlg.getByRole('alert')).toHaveText(/is not empty/)
  await dlg.getByRole('button', { name: 'Cancel' }).click()

  // the disc folder opens like any disc: the same four series
  const again = await launch([disc])
  await expect(firstPanel(again.page)).toHaveAccessibleName(/Axial 2\.5 mm lung, image 1 of 80/, { timeout: 30_000 })
  await expect(again.page.getByRole('listbox', { name: 'Series' }).getByRole('option')).toHaveCount(4)
  await again.app.close()

  // D03-H2: double-clicking the disc's DICOMDIR opens the whole disc
  const byIndex = await launch([join(disc, 'DICOMDIR')])
  await expect(firstPanel(byIndex.page)).toHaveAccessibleName(/Axial 2\.5 mm lung, image 1 of 80/, { timeout: 30_000 })
  await expect(byIndex.page.getByRole('listbox', { name: 'Series' }).getByRole('option')).toHaveCount(4)
  await byIndex.app.close()

  if (!EXE || process.platform !== 'win32') {
    // development build, or macOS: no viewer to copy (the disc viewer is Windows only)
    expect(existsSync(join(disc, 'autorun.inf'))).toBe(false)
    expect(readFileSync(join(disc, 'START HERE.txt'), 'utf8')).toMatch(/no viewer program/)
    return
  }
  // packaged build: the viewer is on the disc and opens the study by itself
  const copied = join(disc, 'Viewer', 'DICOM Viewer.exe')
  expect(existsSync(copied)).toBe(true)
  expect(readFileSync(join(disc, 'autorun.inf'), 'utf8')).toMatch(/open=Viewer\\DICOM Viewer\.exe/)
  expect(existsSync(join(disc, 'Viewer', 'Uninstall DICOM Viewer.exe'))).toBe(false)
  const fromDisc = await launch([], copied)
  await expect(firstPanel(fromDisc.page)).toHaveAccessibleName(/Axial 2\.5 mm lung, image 1 of 80/, { timeout: 30_000 })
  await expect(fromDisc.page.getByRole('listbox', { name: 'Series' }).getByRole('option')).toHaveCount(4)
})
