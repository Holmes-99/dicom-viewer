// Desktop shell (milestone D1). Loads the built viewer from app://viewer/, never from the network.
// The main process lists and reads files; it never parses DICOM (that stays in the sandboxed renderer).
const { app, BrowserWindow, ipcMain, protocol, session } = require('electron')
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

function listFiles(paths) {
  const out = []
  const walk = (p, depth) => {
    if (out.length >= MAX_FILES || depth > 32) return
    let st
    try { st = fs.statSync(p) } catch { return }
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
  createWindow()
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow() })
})

app.on('window-all-closed', () => app.quit())
app.on('web-contents-created', (_e, wc) => {
  wc.on('will-attach-webview', (e) => e.preventDefault())
})
