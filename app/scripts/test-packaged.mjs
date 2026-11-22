// `npm run test:packaged`: the desktop checks against the built program in release/ (run `npm run dist` first).
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const exe = process.platform === 'darwin'
  ? join('release', 'mac-universal', 'DICOM Viewer.app', 'Contents', 'MacOS', 'DICOM Viewer')
  : join('release', 'win-unpacked', 'DICOM Viewer.exe')
if (!existsSync(exe)) throw new Error(`${exe} not found: run npm run dist first`)
execSync('npx playwright test -c playwright.desktop.config.ts', { stdio: 'inherit', env: { ...process.env, VIEWER_EXE: join(process.cwd(), exe) } })
