# Architecture: free DICOM viewer (a rebuild of RadiAnt DICOM Viewer's features)

Working name: TBD (`/replica-brand`). Rules everyone works by: [`ground-rules.md`](ground-rules.md).

**What it is:** an installed **desktop application** for **Windows and Mac**, free, fully offline. It works like RadiAnt and looks like it. A doctor opens a disc, folder or files, reads the images and makes the diagnosis. The app only displays images. It ships with a "not a medical device" notice, the same position RadiAnt takes.

**Delivered three ways:**
1. a Windows installer
2. a portable version that runs from a USB stick without installing
3. a viewer that goes on patient CDs next to the study

Mac gets a `.dmg`.

> Change on 2026-11-22: the first plan used Tauri. What was built so far is the same React + Cornerstone3D viewer running in a browser tab. The shell is now **Electron**. It runs that code unchanged on Windows and Mac, keeps the 41 end-to-end tests, and every PC gets the same Chromium graphics engine. Tauri would use each machine's own web view, which risks memory limits and differences in the 3D graphics.

The default web stack from this skill (Next.js, Postgres, Stripe, auth, hosting) doesn't fit. There are no accounts, payments or servers.

## Stack

| layer | choice | why |
| --- | --- | --- |
| app shell | **Electron** (current stable, 64-bit) | Runs the existing viewer as is, on Windows and Mac. The main process (Node) gets the file system, removable drives, file associations and native dialogs. |
| UI | React 19 + TypeScript + Vite (already built) | Unchanged. The same code also runs in a browser for development and the tests. |
| image rendering | Cornerstone3D 5.19 + vtk.js (MIT) | Unchanged: 2D stacks now, MPR/MIP/VR and fusion later. Runs on any GPU through WebGL2. |
| pixel decoding | Cornerstone DICOM image loader WASM codecs | JPEG baseline/lossless, JPEG-LS, J2K, HTJ2K, RLE. Decoding runs in WASM, so a hostile file can't escape its memory. |
| DICOM parsing | dicom-parser (JS), plus our charset decoder | Already built and tested. Replaces the planned Rust parser. |
| file access | Electron main process (Node `fs`) through a narrow preload bridge | The renderer never gets Node. It can only call the bridge functions listed under API. |
| ZIP | @zip.js/zip.js (AES) | Already built. |
| local archive (later) | `node:sqlite` (built into Node 22+, inside Electron) | No native module to rebuild for each platform. Schema in `schema.sql`. |
| PACS | **not built** (decided 2026-11-22) | If ever added: dcmjs-dimse (pure JS) in the main process, local network only. |
| packaging | **electron-builder** | NSIS per-user installer (no admin rights), portable `.exe`, Mac `.dmg` (Apple Silicon + Intel), and the disc build. |
| updates | **none built in** | Fully offline: new versions are a new installer from the GitHub releases page. There is no auto-updater and the app never checks. |
| telemetry, crash reports | **none** | Patient data. Nothing leaves the computer. |
| tests | Playwright, in the browser (existing 41) plus Electron (`_electron.launch`) | The same specs, plus desktop-only checks: file association, the offline lock, the portable build. |

## The offline lock

"Fully offline" is enforced by code, not just a promise:
- The renderer loads only from a custom `app://` protocol that serves the built files. A content security policy allows `app:`, `blob:` and `data:` only.
- `session.webRequest.onBeforeRequest` cancels every `http`, `https` and `ws` request. An Electron test checks that a `fetch('https://example.com')` from the page fails.
- Electron's own background traffic is turned off: no auto-updater, no crash reporter, spell-check dictionaries disabled.
- `nodeIntegration: false`, `contextIsolation: true` and `sandbox: true`. Navigation and new windows are blocked.

## Data and schema

Unchanged from the first plan. Patient → Study → Series → Instance, keyed by DICOM UIDs and held in memory per session. The opened files are never copied or changed. The local archive (should-have) writes SQLite through `node:sqlite`. See `schema.sql`.

## API: the preload bridge

The renderer sees one object, `window.viewer`. Each call goes to an IPC handler in the main process that checks its input. Pixel bytes come in through the `app://file/{token}` protocol, so large files are not copied through IPC. Tokens are handed out only for files the user opened.

| call | does | input | output | flow |
| --- | --- | --- | --- | --- |
| `pickFolder()` / `pickFiles()` / `pickZip()` | native open dialog | – | paths | F01 |
| `openPaths(paths)` | scan files, folders and DICOMDIR; returns file tokens | paths[] | `{ token, name, size }[]` + progress events | F01 |
| `listDrives()` | removable drives and discs | – | drives | F01 |
| `readFile(token)` | bytes of one opened file (headers, ZIP) | token | ArrayBuffer | F01 |
| `onOpenRequest(cb)` | files passed by double-click, "Open with", drag onto the Dock/taskbar, or the disc launcher | – | paths | F01 |
| `saveFile(name, bytes)` | native save dialog, then write | suggested name, bytes | path or null | F11 |
| `saveToFolder(files)` | pick a folder, write many files (series export) | `{ name, bytes }[]` | count | F11 |
| `prepareDisc(studies, target)` | write the study, a DICOMDIR, the portable Windows viewer and `autorun.inf` into a folder ready to burn | session study ids, folder | progress events | F14 (new) |
| `settings.get/set` | settings JSON in the user's app data folder | key, value | value | S17, S18 |
| `archive.*`, `pacs.*` | later milestones, same shape as the first plan | | | F05, F06 |

`DataSource` (`app/src/data/types.ts`) already hides where the files come from. A new `desktopSource` calls the bridge, `webSource` stays for the browser and the tests, and no screen code changes.

## The three ways to ship

| build | what the user gets | notes |
| --- | --- | --- |
| Windows installer | `Setup.exe` (NSIS). Per-user install, Start menu entry, `.dcm` and `DICOMDIR` associated, "Open with" entry | Unsigned builds show a SmartScreen warning. Code signing removes it (see costs). |
| Windows portable | one `.exe` (or a folder) that runs without installing. Settings go next to the exe when it is writable, otherwise in the user's temp folder | For hospital PCs where staff can't install software. |
| Patient CD viewer | the portable Windows build, plus the study, a `DICOMDIR` and `autorun.inf`, made by **Export → Prepare disc folder…** in the app; the user burns the folder with Windows' own burner | The app does not burn discs itself; Windows and macOS already can. Windows 10/11 no longer autoruns discs, so the disc also has a `START HERE.txt`. |
| Mac | `.dmg` with a universal app (Apple Silicon + Intel) | Unsigned apps need right-click → Open the first time. Signing and notarization need a paid Apple Developer account (see costs). |

## The parts that bite

- **Memory.** A 2000-slice CT is about 1 GB of 16-bit pixels. Electron is 64-bit Chromium, and the renderer heap can be raised with `--max-old-space-size`. Test a real 2000-slice CT in the first desktop milestone.
- **Hostile files.** Discs come from strangers. Parsing stays in the sandboxed renderer and decoding in WASM. The main process only lists and reads bytes, and never parses DICOM. Fuzz `openPaths` with corrupt samples.
- **File access.** The renderer can read only files the user picked, dropped or double-clicked (the token list), never an arbitrary path.
- **Paths.** Windows long paths (>260 characters), network drives, discs that are slow to spin up, and Mac `.dmg` quarantine flags.
- **Double-click while open.** Single-instance lock: a second launch passes its files to the window already open, which opens them, like RadiAnt.
- **HiDPI and several monitors.** Use the device pixel ratio for crisp images. Remember the window position per monitor.
- **Costs to ship cleanly.** Windows code signing is about US$100–400 a year. Apple Developer is US$99 a year. The app works without either, but the operating system shows warnings. This is Holmes-99's decision when releasing (`/replica-deploy`).
- Everything from the first plan still applies: codecs and odd data, character sets, geometry and sync, SUV, calibration, DICOM dates without time zones, and patient privacy.

## Build order

1. ~~Vertical slice~~ and ~~must-haves round 1–2~~ in the browser (done: 20 of 30 must-haves done, 10 partial, 41/41 tests).
2. **D1, the desktop shell.** Electron main and preload, the offline lock, `app://` protocol, `desktopSource`, native open dialogs, a real disc and DICOMDIR, file association, single instance. All 41 tests also run against the Electron build, plus desktop checks.
3. **D2, packaging.** NSIS installer, portable exe and Mac dmg from one command (`npm run dist`). Smoke-test each on a clean Windows PC and a Mac.
4. **D3, patient CD.** Export → Prepare disc folder…, DICOMDIR writer, portable viewer copied in, the disc opens straight to the study.
5. **The 10 partial must-haves** (DICOMDIR use, remaining codecs, the fuzz suite…).
6. **Should-haves.** Local archive, MPR/MIP, volume rendering, more tools, print, MP4/DICOM export. No PACS (see below).
7. **Could-haves**, then fixes from `/replica-entrepreneur`.

## Decided: no PACS for now

PACS is a hospital's central image server. RadiAnt can search one and download studies over the hospital network (6 should-have features). Holmes-99's users open files, folders and CDs, and the app is fully offline, so PACS is **left out** (2026-11-22). The bridge has room for a `pacs.*` group later. If it is ever added, it is local network only, off by default, and set up by hand.
