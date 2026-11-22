# Architecture: free DICOM viewer (a rebuild of RadiAnt DICOM Viewer's features)

Working name: TBD (`/replica-brand`). Platform: Windows 10/11 desktop, 64-bit, offline, free.
Decisions so far:
- **Viewer only.** It displays images and the doctor makes the diagnosis. It ships with a "not a medical device" notice, the same position RadiAnt takes.
- **Same UI.** It keeps the original's layout, workflow, toolbar order, default shortcuts and mouse mapping, so users don't have to relearn anything. The icons, logo, name and text are drawn and written fresh.

The default web stack from this skill (Next.js, Postgres, Stripe, auth) doesn't fit this app. RadiAnt is a local desktop app with no accounts, no payments and no server, so the clone is one too.

## Stack

| layer | choice | why |
| --- | --- | --- |
| app shell | **Tauri 2** (Rust core + WebView2) | Installer around 10 MB, close to the original's light footprint. The Rust core does file I/O, networking and the database. Electron is the fallback if WebView2 memory limits bite (see below). |
| UI | React + TypeScript + Vite | Fast to build the toolbar, dialogs and tables. Tokens come from `/replica-design`. |
| image rendering | **Cornerstone3D** (MIT) + vtk.js | Medical 2D stack viewer, MPR, MIP/MinIP/Avg slabs, volume rendering, fusion and tools. Used by OHIF and proven in clinics. Runs on any GPU through WebGL2, while the original needs NVIDIA. |
| pixel decoding | Cornerstone DICOM image loader WASM codecs (libjpeg-turbo, CharLS, OpenJPEG, OpenJPH) | Covers JPEG baseline/lossless, JPEG-LS, J2K and HTJ2K. Decoding runs sandboxed in WASM, so a malicious file can't write outside its memory (the original's CVE-2026-17264). |
| DICOM parsing and indexing | **dicom-rs** (Rust, MIT/Apache) | Memory-safe parsing of headers, DICOMDIR and character sets in the core. |
| DICOM networking | dicom-rs `ul` crate (C-ECHO/FIND/MOVE/GET/STORE SCU + STORE SCP) | Pure Rust with nothing extra to install. Fallback: bundle DCMTK command-line tools (BSD) as a Tauri sidecar. |
| database | SQLite (rusqlite, FTS5) | Local archive and settings, one file per archive. See `schema.sql`. |
| ZIP | `zip` crate with AES | Handles password ZIPs (AES-128/192/256). |
| video export | WebCodecs → MP4 muxer (mp4-muxer) | MP4 straight from canvas frames. WMV is dropped because nobody needs it in 2026. |
| STL export | vtk.js marching cubes → binary STL | |
| printing | WebView print to a printer or PDF | |
| i18n | i18next | 30+ languages later, written fresh. |
| installer and updates | Tauri bundler (MSI + NSIS), Tauri updater with signed releases | Updates are signed so the update check can't be hijacked (the original's CVE-2025-1001). |
| telemetry | **none** | The app handles patient data. Nothing leaves the PC except the user's own PACS traffic. |

No payments, auth, email, server or hosting. The only hosting needed is a download page plus the update feed (`/replica-deploy`).

## Schema

Tables: 7 in `app.db` + 6 in each `archive.db` (plus an FTS index). Access rules: none in the database. It is a single-user local file, and Windows file permissions protect it. Full SQL is in `replica/schema.sql`.

Hierarchy: Patient → Study → Series → Instance, keyed by DICOM UIDs. Files opened from a disc or folder are **not** imported. They get an in-memory index of the same shape, and only "Import to archive" writes rows and copies files. Measurements live in memory per session, like the original. Saving them as DICOM SR is a could-have.

## API

The "API" is the set of Tauri commands the UI calls in the Rust core, plus DICOM network services. Pixel data reaches the WebView through a custom protocol (`dcm://instance/{id}/frame/{n}`), so large files are never copied through JSON.

| command | does | input | output | flow |
| --- | --- | --- | --- | --- |
| `open_paths` | scan files/folders/DICOMDIR, build the study tree | paths[] | session tree + progress events | F01 |
| `open_media` | list removable drives, open one | drive | as above | F01 |
| `open_zip` | open a ZIP (asks for a password if needed) | path, password? | as above | F01 |
| `dcm://` protocol | stream raw instance bytes or a frame | instance id, frame | bytes | F01–F04 |
| `get_tags` | full tag tree for the DICOM tags window | instance id | JSON tree | S12 |
| `save_raw_value` | write one tag's raw bytes to a file | instance, tag, path | ok | S12 |
| `archive_list` / `archive_create` / `archive_delete` | manage archives | name, path | archives | F06 |
| `archive_import` | copy and index into an archive | source (paths, session study, PACS) | progress events | F06 |
| `archive_search` | FTS search with `a \| b`, filters | query, date range, modality | studies | F06 |
| `archive_keywords_set` | tag a study | study, keywords[] | ok | F06 |
| `archive_export` | copy studies to another archive or a folder, or write CSV | ids, target | ok | F06, F11 |
| `pacs_nodes_*` | create/read/update/delete nodes | node | nodes | S06 |
| `pacs_echo` | C-ECHO test | node | ok, ms | S06 |
| `pacs_find` | C-FIND at study or series level | node, query, level | results | F05 |
| `pacs_retrieve` | C-MOVE or C-GET into temp or an archive | node, uids, level | progress events | F05 |
| `pacs_send` | C-STORE SCU of a patient/study/series/image | node, uids | progress events | F12 |
| `listener_config` / `listener_start` / `listener_stop` | the C-STORE SCP | listener row | status | F05 |
| `export_images` | JPEG/BMP/PNG of one image, a series or everything | rendered frames from UI, path | files | F11 |
| `export_dicom` | copy original DICOM out | uids, path | files | F11 |
| `export_file` | save bytes the UI produced (MP4, STL, PDF) | bytes, path | ok | F07, F11 |
| `anonymize` | apply a template, write new files with fresh UIDs | template, uids, out | progress events | F12 |
| `settings_*`, `bindings_*`, `presets_*` | read/write settings | | | S17, S18 |
| `cleanup_temp` | delete the temp retrieve folder | | | on exit |

Events from the core to the UI: `progress`, `study_received` (from the SCP), `media_inserted`.
No webhooks. Jobs: the SCP listener (long-running), temp cleanup on exit and on next start, and an update check at launch.

Everything else runs in the UI: rendering, all tools and measurements, sync and reference lines, MPR/VR, fusion, TIC, DSA, cine and layouts.

## The parts that bite

- **Memory.** A 2000-slice CT is about 1 GB of 16-bit pixels, and a PET-CT fusion holds two volumes. WebView2 has per-renderer memory caps. Mitigations: use 16-bit textures, decode on demand for 2D, build the volume only when entering MPR/VR, and test early in the slice. If it fails, switch the shell to Electron, which needs no UI changes.
- **Malformed and hostile files.** Doctors open discs from strangers. Parse in Rust, decode in WASM, fuzz `open_paths` with corrupt samples, and never crash the whole app on one bad file.
- **Codecs and odd data.** JPEG-LS, J2K/HTJ2K, RLE, YBR_FULL_422, 32-bit pixels, multi-frame, signed pixels, Modality LUT and VOI LUT, palette colour, overlays (60xx). The test corpus needs a sample of each (see risks).
- **Character sets.** Specific Character Set, including ISO 2022 for Japanese and Korean, GB18030, and Windows-1251 and CP950/936 overrides. Patient names have to display correctly.
- **Geometry.** Sync and reference lines need ImagePositionPatient and ImageOrientationPatient, tilted-gantry CT, non-parallel planes (5° tolerance), and different Frame of Reference UIDs (manual sync).
- **PACS interop.** AE title config, transfer-syntax negotiation with legacy PACS, C-MOVE needing an inbound port (Windows firewall rule in the installer), timeouts, and rejecting unknown hosts.
- **SUV.** Body weight, injected dose, decay correction to series time, and units (BQML). If any of these is wrong, the number on screen is wrong.
- **Calibration.** Pixel Spacing vs Imager Pixel Spacing, ultrasound calibrated regions, and the magnification factor for CR/DX/XA. Show "uncalibrated" when spacing is missing.
- **DICOM dates.** They have no time zone, so store and display them exactly as written.
- **Patient privacy.** Retrieved studies go to a temp folder that is wiped on exit, there is a "Hide patient data" mode, no telemetry, and the update check sends nothing but the version.
- **Windows.** Long paths (>260), HiDPI and multi-monitor scaling, files locked by antivirus, and no admin rights needed to install (per-user install).
- **Same UI as the original.** Layout, shortcuts and mouse mapping are copied from the user's installed copy, not guessed. Run the click-through (recon source 8) before `/replica-design`.

## Build order

1. **Vertical slice (core loop, ugly).** S01, S02 (1x1), S03.
   `open_paths`, `dcm://`. Covers uncompressed and JPEG lossless files, wheel scroll, W/L drag, zoom/pan, length measurement and overlay text.
   This proves Tauri + Cornerstone3D + memory on a real 2000-slice CT.
2. **Must-haves (30).** All codecs, DICOMDIR/CD/ZIP, presets, rotate/flip/invert, cine, layouts to 5x5, auto sync and reference lines, angle/ellipse (HU)/calibration, DICOM tags window, JPEG/BMP/clipboard export, the safe-parsing fuzz suite and the "not a medical device" notice. At this point it matches the original for everyday reading.
3. **Should-haves (30).** PACS (S05, S06, listener), local archive (S04), MPR/MIP slabs (S07), volume rendering (S08), the remaining measurement tools, manual sync, multi-window, print, MP4/DICOM export, and the bindings editor (S17).
4. **Could-haves (14).** Fusion and SUV (S09), TIC (S10), DSA (S11), scalpel, movie creator (S19), STL, anonymization (S15), SR/PDF/video (S20), a settings UI (S18) and translations.
5. **Fixes from `/replica-entrepreneur`**, once it has run.

## Risks to retire first

1. Memory and performance of a 2000-slice volume in WebView2 (slice 1).
2. A test corpus: use public DICOM sample sets (e.g. the pydicom/GDCM/dcm4che test data and The Cancer Imaging Archive, all de-identified) to cover every modality and codec. Never use real patient files from a clinic for development.
3. PACS interop: test against Orthanc (free, open-source PACS) locally, then against the clinic's PACS.
