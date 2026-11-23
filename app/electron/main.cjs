// Desktop shell (milestone D1). Loads the built viewer from app://viewer/, never from the network.
// The main process lists and reads files; it never parses DICOM (that stays in the sandboxed renderer).
const { app, BrowserWindow, dialog, ipcMain, protocol, session } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { Readable } = require('node:stream')
const crypto = require('node:crypto')

const DIST = path.join(__dirname, '..', 'dist')
const ORIGIN = 'app://viewer'

// ------------------------------------------------------------ offline lock, part 1: nothing in the background
app.commandLine.appendSwitch('disable-background-networking')
app.commandLine.appendSwitch('disable-component-update')
app.commandLine.appendSwitch('disable-domain-reliability')
app.commandLine.appendSwitch('no-pings')
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=8192') // big CTs (architecture: memory)

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
])

// Settings folder. Tests give each launch its own. The portable build keeps settings next to the exe when that
// folder is writable (a USB stick), otherwise in the temp folder, so a hospital PC is left untouched.
function portableDataDir() {
  const dir = process.env.PORTABLE_EXECUTABLE_DIR
  if (!dir) return null
  const next = path.join(dir, 'DICOM Viewer data')
  try {
    fs.mkdirSync(next, { recursive: true })
    fs.accessSync(next, fs.constants.W_OK)
    return next
  } catch {
    return path.join(app.getPath('temp'), 'DICOM Viewer data')
  }
}
const dataDir = process.env.VIEWER_USER_DATA || portableDataDir()
if (dataDir) app.setPath('userData', dataDir)

// ------------------------------------------------------------ single instance: a second launch hands its files over
// Chromium rewrites the command line it hands to the first instance, so the paths travel resolved, as data.
if (!app.requestSingleInstanceLock({ paths: pathsFromArgv(process.argv) })) {
  app.quit()
  return
}

/** @type {BrowserWindow | null} */
let win = null
let rendererReady = false
/** paths waiting until the window is ready */
let pending = []

/** files passed on the command line: double-click, "Open with", a disc launcher, or a test */
function pathsFromArgv(argv) {
  const self = path.resolve(app.getAppPath())
  return argv.slice(1)
    .filter((a) => !a.startsWith('-') && fs.existsSync(a))
    .map((a) => path.resolve(a))
    .filter((p) => p !== self && p !== path.resolve(process.execPath))
}

function requestOpen(paths) {
  if (!paths.length) return
  if (rendererReady && win) win.webContents.send('open-request', listFiles(paths))
  else pending.push(...paths)
  if (win) { if (win.isMinimized()) win.restore(); win.focus() }
}

app.on('second-instance', (_e, _argv, _cwd, data) => {
  const paths = Array.isArray(data?.paths) ? data.paths.filter((p) => typeof p === 'string' && fs.existsSync(p)) : []
  requestOpen(paths)
  if (!paths.length && win) { if (win.isMinimized()) win.restore(); win.focus() }
})
app.on('open-file', (e, p) => { e.preventDefault(); requestOpen([p]) }) // macOS: Finder, Dock

// ------------------------------------------------------------ file tokens: the renderer only sees files the user opened
/** token -> absolute path */
const tokens = new Map()
const MAX_FILES = 200_000
// program files that discs carry next to the images (their viewer, autorun); never DICOM, often huge
const NOT_IMAGES = /\.(exe|dll|pak|asar|dat|bin|inf|ini|txt|json|html?|js|css|ico|lnk|sys|msi|dylib|so|nsh)$/i

function listFiles(paths) {
  const out = []
  const walk = (p, depth) => {
    if (out.length >= MAX_FILES || depth > 32) return
    let st
    try { st = fs.statSync(p) } catch { return }
    if (depth > 0 && st.isFile() && NOT_IMAGES.test(p)) return
    if (st.isDirectory()) {
      let names = []
      try { names = fs.readdirSync(p) } catch { return }
      for (const n of names) walk(path.join(p, n), depth + 1)
    } else if (st.isFile()) {
      const token = crypto.randomUUID()
      tokens.set(token, p)
      out.push({ token, name: path.basename(p), size: st.size })
    }
  }
  for (const p of paths) walk(p, 0)
  return out
}

// ------------------------------------------------------------ patient disc folder (D3)
// The page sends the images and the DICOMDIR it built; this side only writes them into the folder the user
// picked, under names it checks, then adds the viewer, autorun.inf and a START HERE note.
const VIEWER_DIR = 'Viewer'
const VIEWER_EXE = 'DICOM Viewer.exe'
/** id -> target folder */
const discs = new Map()

/** what can be copied onto the disc as the viewer: the portable exe, or the installed program folder (Windows only) */
function viewerSource() {
  if (!app.isPackaged || process.platform !== 'win32') return null
  if (process.env.PORTABLE_EXECUTABLE_FILE) return { kind: 'file', path: process.env.PORTABLE_EXECUTABLE_FILE }
  return { kind: 'dir', path: path.dirname(process.execPath) }
}
const skipInViewer = (p) => /^uninstall/i.test(path.basename(p))
// Electron's fs shows app.asar as a folder; the program folder must be measured and copied as plain files
const rawFs = require('original-fs')

async function sizeOf(p) {
  const st = await rawFs.promises.stat(p)
  if (!st.isDirectory()) return st.size
  let n = 0
  for (const e of await rawFs.promises.readdir(p)) if (!skipInViewer(e)) n += await sizeOf(path.join(p, e))
  return n
}

/** DICOM File IDs: up to 8 components of 1-8 upper-case letters, digits or _ (PS3.10 / ISO 9660) */
const validFileId = (parts) => Array.isArray(parts) && parts.length >= 1 && parts.length <= 8
  && parts.every((c) => typeof c === 'string' && /^[A-Z0-9_]{1,8}$/.test(c))

const START_HERE = (viewer) => [
  'Patient images',
  '==============',
  '',
  viewer
    ? `Windows: open the "${VIEWER_DIR}" folder and double-click "${VIEWER_EXE}". The images open by themselves.`
    : 'This disc has no viewer program on it.',
  'Mac, or any other computer: open the DICOMDIR file or the DICOM folder with a DICOM viewer.',
  '',
  'The viewer is free, needs no installation and never connects to the internet.',
  'It is not a certified medical device: the doctor reading the images makes the diagnosis.',
  '',
].join('\r\n')

ipcMain.handle('disc:caps', async (e) => {
  if (e.sender !== win?.webContents) return null
  const src = viewerSource()
  return { viewer: !!src, viewerBytes: src ? await sizeOf(src.path) : 0 }
})

ipcMain.handle('disc:begin', async (e) => {
  if (e.sender !== win?.webContents) return { error: 'denied' }
  const r = await dialog.showOpenDialog(win, {
    title: 'Choose an empty folder for the disc',
    buttonLabel: 'Use this folder',
    properties: ['openDirectory', 'createDirectory'],
  })
  if (r.canceled || !r.filePaths[0]) return { error: 'canceled' }
  const folder = r.filePaths[0]
  if ((await fs.promises.readdir(folder)).length) return { error: 'not-empty', name: path.basename(folder) }
  const id = crypto.randomUUID()
  discs.set(id, folder)
  return { id, name: path.basename(folder) }
})

ipcMain.handle('disc:file', async (e, id, parts, bytes) => {
  const folder = discs.get(id)
  if (e.sender !== win?.webContents || !folder || !validFileId(parts) || !(bytes instanceof Uint8Array || bytes instanceof ArrayBuffer)) return false
  if (parts.length > 1 && parts[0] !== 'DICOM') return false
  if (parts.length === 1 && parts[0] !== 'DICOMDIR') return false
  const file = path.join(folder, ...parts)
  await fs.promises.mkdir(path.dirname(file), { recursive: true })
  await fs.promises.writeFile(file, Buffer.from(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes), { flag: 'wx' })
  return true
})

ipcMain.handle('disc:finish', async (e, id, withViewer) => {
  const folder = discs.get(id)
  if (e.sender !== win?.webContents || !folder) return null
  discs.delete(id)
  const src = withViewer ? viewerSource() : null
  if (src) {
    const dest = path.join(folder, VIEWER_DIR)
    if (src.kind === 'file') {
      await rawFs.promises.mkdir(dest, { recursive: true })
      await rawFs.promises.copyFile(src.path, path.join(dest, VIEWER_EXE))
    } else {
      await rawFs.promises.cp(src.path, dest, { recursive: true, filter: (s) => !skipInViewer(s) })
    }
    await fs.promises.writeFile(path.join(folder, 'autorun.inf'),
      `[autorun]\r\nopen=${VIEWER_DIR}\\${VIEWER_EXE}\r\nicon=${VIEWER_DIR}\\${VIEWER_EXE},0\r\nlabel=Patient images\r\n`)
  }
  await fs.promises.writeFile(path.join(folder, 'START HERE.txt'), START_HERE(!!src))
  return { name: path.basename(folder), bytes: await sizeOf(folder), viewer: !!src }
})

/** Started from a patient disc with nothing to open: open the disc it sits on (DICOMDIR next to it or one level up). */
function discNextToApp() {
  if (!app.isPackaged) return []
  const dirs = [process.env.PORTABLE_EXECUTABLE_DIR, path.dirname(process.execPath)].filter(Boolean)
  for (const d of dirs) for (const c of [d, path.dirname(d)]) if (fs.existsSync(path.join(c, 'DICOMDIR'))) return [c]
  return []
}

// ------------------------------------------------------------ app:// protocol
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.dcm': 'application/dicom',
}
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' blob:",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self' data:",
  "connect-src 'self' blob: data:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

async function serve(req) {
  const url = new URL(req.url)
  if (url.host !== 'viewer') return new Response('not found', { status: 404 })
  // an opened file, same origin as the page: app://viewer/@file/{token}
  if (url.pathname.startsWith('/@file/')) {
    const p = tokens.get(url.pathname.slice('/@file/'.length))
    if (!p) return new Response('not found', { status: 404 })
    try {
      const { size } = await fs.promises.stat(p)
      return new Response(Readable.toWeb(fs.createReadStream(p)), {
        headers: { 'content-type': 'application/octet-stream', 'content-length': String(size) },
      })
    } catch {
      return new Response('gone', { status: 410 }) // disc ejected, file deleted
    }
  }
  let rel = decodeURIComponent(url.pathname)
  if (rel === '/' || !path.extname(rel)) rel = '/index.html'
  const file = path.normalize(path.join(DIST, rel))
  if (!file.startsWith(DIST + path.sep)) return new Response('forbidden', { status: 403 })
  try {
    const body = await fs.promises.readFile(file)
    return new Response(body, {
      headers: {
        'content-type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
        'content-security-policy': CSP,
      },
    })
  } catch {
    return new Response('not found', { status: 404 })
  }
}

// ------------------------------------------------------------ window
function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 800, minHeight: 600,
    backgroundColor: '#0b0d10',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
      webviewTag: false,
    },
  })
  win.once('ready-to-show', () => win?.show())
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(ORIGIN + '/')) e.preventDefault() })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('did-start-loading', () => { rendererReady = false })
  win.on('closed', () => { win = null })
  win.loadURL(ORIGIN + '/')
}

app.whenReady().then(() => {
  const ses = session.defaultSession

  // offline lock, part 2: every network request is cancelled, whatever asks for it
  ses.webRequest.onBeforeRequest((details, cb) => {
    const scheme = details.url.split(':', 1)[0].toLowerCase()
    cb({ cancel: !['app', 'blob', 'data', 'devtools', 'chrome-extension'].includes(scheme) })
  })
  // no camera, microphone, location, notifications…; only writing images to the clipboard
  ses.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === 'clipboard-sanitized-write'))
  ses.setPermissionCheckHandler((_wc, perm) => perm === 'clipboard-sanitized-write' || perm === 'fileSystem')
  ses.setSpellCheckerEnabled(false)
  ses.setSpellCheckerDictionaryDownloadURL('app://viewer/none/')

  protocol.handle('app', serve)

  ipcMain.handle('viewer:ready', (e) => {
    if (e.sender !== win?.webContents) return []
    rendererReady = true
    const list = listFiles(pending)
    pending = []
    return list
  })
  ipcMain.handle('viewer:version', () => app.getVersion())

  pending.push(...pathsFromArgv(process.argv))
  if (!pending.length) pending.push(...discNextToApp())
  createWindow()
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow() })
})

app.on('window-all-closed', () => app.quit())
app.on('web-contents-created', (_e, wc) => {
  wc.on('will-attach-webview', (e) => e.preventDefault())
})
