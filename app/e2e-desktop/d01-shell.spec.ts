import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// D1: the desktop shell. Needs `npm run build` first (the shell loads dist/).
const APP = resolve(import.meta.dirname, '..')
const DEMO = join(APP, 'dist', 'demo')
const ELECTRON = createRequire(import.meta.url)('electron') as string

async function launch(args: string[] = []) {
  const userData = mkdtempSync(join(tmpdir(), 'viewer-test-'))
  const app = await electron.launch({ args: [APP, ...args], env: { ...process.env, VIEWER_USER_DATA: userData } })
  const page = await app.firstWindow()
  const problems: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()) })
  page.on('pageerror', (e) => problems.push(e.message))
  return { app, page, userData, problems }
}

async function acceptNotice(page: Page) {
  const notice = page.getByRole('dialog', { name: 'Before you start' })
  await notice.getByRole('checkbox', { name: 'I understand' }).check()
  await notice.getByRole('button', { name: 'Continue' }).click()
  await expect(notice).toBeHidden()
}

const firstPanel = (page: Page) => page.getByRole('img', { name: /image \d+ of \d+$/ }).first()

let running: ElectronApplication | null = null
test.afterEach(async () => { await running?.close().catch(() => {}); running = null })

test('D01-H1 the window loads the viewer from app://, with no Node in the page', async () => {
  const { app, page, problems } = await launch()
  running = app
  expect(page.url()).toBe('app://viewer/')
  await acceptNotice(page)
  await expect(page.getByRole('heading', { name: 'Open a study' })).toBeVisible()
  const env = await page.evaluate(() => ({
    require: typeof (window as unknown as { require?: unknown }).require,
    process: typeof (window as unknown as { process?: unknown }).process,
    desktop: (window as unknown as { viewer?: { desktop: boolean } }).viewer?.desktop,
  }))
  expect(env).toEqual({ require: 'undefined', process: 'undefined', desktop: true })
  expect(problems).toEqual([])
})

test('D01-H2 offline lock: the page cannot reach the network or the disk', async () => {
  const { app, page } = await launch()
  running = app
  const results = await page.evaluate(async () => {
    const tryFetch = (u: string) => fetch(u).then((r) => `ok ${r.status}`, () => 'blocked')
    const img = (u: string) => new Promise<string>((res) => { const i = new Image(); i.onload = () => res('loaded'); i.onerror = () => res('blocked'); i.src = u })
    const ws = () => new Promise<string>((res) => { try { const s = new WebSocket('wss://example.com/'); s.onopen = () => res('open'); s.onerror = () => res('blocked') } catch { res('blocked') } })
    return {
      https: await tryFetch('https://example.com/'),
      http: await tryFetch('http://127.0.0.1:5173/'),
      image: await img('https://example.com/favicon.ico'),
      socket: await ws(),
      file: await tryFetch('file:///C:/Windows/win.ini'),
      unknownToken: await tryFetch('/@file/not-a-token'),
      outsideDist: await tryFetch('/..%2Fpackage.json'),
    }
  })
  expect(results).toEqual({
    https: 'blocked', http: 'blocked', image: 'blocked', socket: 'blocked', file: 'blocked',
    unknownToken: 'ok 404', outsideDist: expect.stringMatching(/^ok 40[34]$/),
  })
  // navigating away is refused too
  await page.evaluate(() => { location.href = 'https://example.com/' })
  await page.waitForTimeout(500)
  expect(page.url()).toBe('app://viewer/')
})

test('D01-H3 the demo study opens (decoders and workers run under the content policy)', async () => {
  const { app, page, problems } = await launch()
  running = app
  await acceptNotice(page)
  await page.getByRole('button', { name: 'Try the demo study' }).click()
  await expect(firstPanel(page)).toHaveAccessibleName(/Axial 2\.5 mm lung, image 1 of 80/, { timeout: 30_000 })
  expect(problems).toEqual([])
})

test('D01-H4 a folder passed on the command line opens (double-click / Open with)', async () => {
  const { app, page, problems } = await launch([DEMO])
  running = app
  await acceptNotice(page)
  await expect(firstPanel(page)).toHaveAccessibleName(/Axial 2\.5 mm lung, image 1 of 80/, { timeout: 30_000 })
  await expect(page.getByRole('listbox', { name: 'Series' }).getByRole('option')).toHaveCount(4)
  expect(problems).toEqual([])
})

test('D01-H5 a second launch hands its files to the open window and quits', async () => {
  const { app, page, userData } = await launch()
  running = app
  await acceptNotice(page)
  await expect(page.getByRole('heading', { name: 'Open a study' })).toBeVisible()
  const second = spawn(ELECTRON, [APP, join(DEMO, 's2_001.dcm')], { env: { ...process.env, VIEWER_USER_DATA: userData } })
  const code = await new Promise<number | null>((res) => second.on('exit', res))
  expect(code).toBe(0)
  await expect(firstPanel(page)).toHaveAccessibleName(/image 1 of 1$/, { timeout: 30_000 })
  expect(app.windows()).toHaveLength(1)
})
