# Recon map: RadiAnt DICOM Viewer (Windows desktop)

Scope: full feature parity was requested. Build order: the core 2D reading loop first, then PACS, MPR/3D, fusion and the rest (see Size).
For: doctors who open and read medical images (CT, MR, X-ray, US, PET), offered free.
Date: 2026-11-22
Original version studied: 2026.1 (built 2026-07-14). The online manual is older: it covers 2021.2.

> **Evidence level.** Everything here comes from public pages: the vendor site, the manual and the changelog.
> No screens were captured from a running copy yet, so every "states seen" cell reads *docs*. Next step: click
> through the copy installed on the user's own PC (with the user present) and save reference shots in `replica/screens/`.

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | marketing site | https://www.radiantviewer.com/ | modalities, feature overview, languages |
| 2 | product page | https://www.radiantviewer.com/products/radiant-dicom-viewer-standard/ | trial terms, platforms, current version |
| 3 | pricing page | https://www.radiantviewer.com/store/pricing/ | subscription EUR 5/month to EUR 179/5 years per PC; CD/DVD edition EUR 399 |
| 4 | changelog | https://www.radiantviewer.com/products/versions/standard/ | per-release features, 2015–2026 |
| 5 | manual (2021.2) | https://www.radiantviewer.com/dicom-viewer-manual/ | intended-use statement |
| 6 | manual: features | https://www.radiantviewer.com/dicom-viewer-manual/radiant_dicom_viewer_features.html | most complete feature list |
| 7 | manual: system reqs | https://www.radiantviewer.com/dicom-viewer-manual/system_requirements.html | 1 GB RAM min, NVIDIA GPU for 3D |
| 8 | user's own installed copy | local (Start menu: "RadiAnt DICOM Viewer (64-bit)") | not used yet: next step |
| 9 | not read yet | /products/ (feature matrix), /terms/ (EULA), /beta/, macOS and Linux how-to pages | read before the build |

## Core loop

A doctor opens a patient's study from a disc, folder, ZIP or PACS. They scroll through the slices, adjust window/level and measure a finding. They compare the study with another series or a prior.

## Screens

| ID | screen | route / how to reach | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S01 | Start / empty viewer | launch app | first-run entry; open data | toolbar, Open menu (folder, files, CD/DVD, ZIP, PACS, archive), drop zone | docs: empty, trial banner |
| S02 | 2D viewer | after opening a study | main reading screen | toolbar, series thumbnail bar, panel grid (up to 5x5), overlays (patient/study text), scrollbar, cine controls | docs: loading, filled, multi-panel, full-screen, distraction-free, hide-patient-data |
| S03 | Open series (F4) | F4 / series bar | pick a series to show in a panel | searchable sortable list, modality column, multi-select, merge-series | docs |
| S04 | Local archive | Folder menu → archive | patient/study database on disk | study table, keyword filter (`a\|b` OR search), import, export to archive, CSV export, multiple databases | docs: empty, filled |
| S05 | PACS search | Folder menu → PACS | query and retrieve from a hospital PACS | query form (name, ID, date, modality, birth date), presets, results table, series drill-down, download, refresh F5 | docs: searching, results, timeout/error |
| S06 | PACS nodes settings | PACS window → settings | configure remote AE titles and the local listener | node list (AE title, host, port, C-MOVE/C-GET), echo test, listener port, IP allowlist, pause-on-lock | docs |
| S07 | 3D MPR | toolbar on a volumetric series | orthogonal/oblique reconstructions | 3 linked planes, rotatable axes, MIP/MinIP/Avg slab, thickness, presets, measurements | docs (GPU / no GPU) |
| S08 | 3D volume rendering | toolbar on a volumetric series | 3D view of anatomy | VR canvas, presets (angio, airways, bone+skin, MIP), opacity/colour curve, scalpel with undo/redo, snapshot, movie | docs (GPU / no GPU) |
| S09 | PET-CT / MR fusion | drag a PET series onto CT | overlay functional on anatomy | colour LUT (Hot Iron), opacity slider, SUV readouts | docs |
| S10 | Time-intensity curve | ROI on a dynamic MR series | enhancement curve (breast MR) | chart, curve type label (Ia/Ib/II/III) | docs |
| S11 | DSA mode | on an XA series | subtraction angiography | mask frame, auto/manual pixel shift, split mask, magic mask | docs |
| S12 | DICOM tags | context menu / shortcut | inspect metadata | tag tree, search, copy, save raw value, pin/colour | docs |
| S13 | Export dialog | toolbar → export | save images or movies | format (JPEG, BMP, MP4, WMV, DICOM, STL), scope (image/series/all), destination | docs |
| S14 | Print dialog | toolbar → print | print to a printer or PDF | printer picker, layout | docs |
| S15 | Anonymize | archive / context menu | strip patient identifiers | template list, tag rules, output folder | docs (added 2024.1) |
| S16 | Send to PACS | PACS / context menu | push studies to a node | node picker, scope (patient/study/image), progress | docs |
| S17 | Keyboard and mouse bindings | Help menu | customize shortcuts and mouse buttons per tool | binding table, modifiers, extra mouse buttons | docs |
| S18 | Settings | options file (options.xml) in the original | units, precision, character sets, layout, window direction | (original has no full UI: the clone should add one) | docs |
| S19 | 3D movie creator | from S08 | record a rotation or snapshot video | keyframes, fps, export | docs |
| S20 | SR / PDF / video viewer | open such an object | structured reports, encapsulated PDF, MPEG video | HTML render, external player | docs |
| S21 | About / license | Ctrl+F1 | version, licence | (the clone needs no licence screen: it is free) | docs |

## Flows

```
F01 Open a study from disc / folder / ZIP and read it          (core loop)
    S01 -> OS picker -> S02
    happy path clicks: ~3 (Open, pick folder, OK) then wheel-scroll
    edge: DICOMDIR or none, mixed studies on one disc, compressed (JPEG-LS, J2K, HTJ2K, RLE),
          password ZIP, non-compliant files, 32-bit pixels, huge series (2000+ slices), malformed files (security)

F02 Adjust the image while reading
    S02: drag W/L, pick CT preset (lung, bone...), zoom, pan, rotate, flip, invert, filters, cine
    edge: PET (SUV window), US (YBR colour), multi-frame, overlays on/off

F03 Measure a finding
    S02 or S07: pick tool -> click points -> value shown (mm, HU, SUV, area, angle)
    happy path clicks: 3
    edge: no pixel spacing (calibrate manually), US calibrated regions, ESC cancels, delete ROI

F04 Compare series or a prior
    S02 split layout -> S03 choose series -> auto sync (same plane) or manual sync (different study)
    edge: non-parallel planes up to 5 degrees, reference lines across windows, duplicate window

F05 Query and retrieve from PACS
    S06 set node (once) -> S05 search -> pick study/series -> download -> S02
    happy path clicks: ~5
    edge: C-MOVE vs C-GET, timeout, unknown host rejected, transfer-syntax limits on legacy PACS

F06 Import to and search the local archive
    S04 import from disc/folder/PACS -> keyword -> search -> open
F07 3D: MPR and volume rendering
    S02 -> S07 (oblique, MIP slab) or S08 (preset, scalpel, snapshot, movie, STL export)
    edge: no NVIDIA GPU (CPU fallback), tilted-gantry CT
F08 PET-CT fusion           S02 -> S09
F09 Breast MR TIC           S02 -> ROI -> S10
F10 DSA on angiography      S02 -> S11
F11 Export / print / copy   S02 -> S13 | S14 | Ctrl+C
F12 Anonymize and share     S04 -> S15 -> export or S16
F13 Customize shortcuts     S17
```

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| Toolbar | 2D, MPR, VR; hideable buttons | active tool, disabled | S02, S07, S08 |
| Image panel (viewport) | 2D, MPR plane, VR, fused | loading, rendering, selected, synced | S02, S07–S11 |
| Overlay text corners | patient, study, series, W/L, zoom, slice | hidden (anonymous) | all viewports |
| Series thumbnail bar | horizontal/vertical | loading thumb, active, in-other-panel | S02 |
| Layout picker | 1x1 … 5x5 | | S02 |
| Measurement tools | length, ratio, angle, Cobb, deviation, ellipse, rectangle, polygon open/closed, ellipsoid volume, arrow, pen, 3D cursor, calibrate | drawing, selected, editing, deleted | S02, S07, S08 |
| Window presets menu | CT, PET %, custom | | S02, S07, S08 |
| Cine control | fps slider, play/pause | | S02 |
| Data table | sortable, searchable | empty, loading, error | S03, S04, S05, S12 |
| Modal dialog | export, print, anonymize, send, settings | | S13–S18 |
| Progress / toast | import, download, export | running, done, failed | many |
| Context menu | viewport, thumbnail, archive row | | S02, S04 |

## Inferred data model

```
Patient    patient_id, name, birth_date, sex
           evidence: DICOM standard (0010,xxxx); S04, S05 columns   confidence: high
Study      study_uid, patient_id, date, description, accession, modalities[], referring
           evidence: DICOM standard; S04/S05                         confidence: high
Series     series_uid, study_uid, modality, number, description, frame_of_reference_uid, orientation
           evidence: S03 list, sync logic                            confidence: high
Instance   sop_uid, series_uid, instance_number, file_path, transfer_syntax, frames, pixel spacing, position
           evidence: sorting options, codec list                     confidence: high
Archive    id, name, path (several allowed)                        evidence: changelog 5.0.0 / 2024.1   confidence: high
Keyword    archive_id, study_uid, text                             evidence: S04 search                 confidence: medium
PacsNode   ae_title, host, port, retrieve_method (move|get), allowed_syntaxes
           evidence: S06, changelog 2024.2/2025.2                    confidence: high
Measurement  id, instance or volume ref, tool type, points[], computed values   (session only? persisted?)
           evidence: S02/S07 tools                                   confidence: guess on persistence
WindowPreset name, center, width, scope (2D|MPR|VR)                evidence: changelog 2020.2  confidence: high
AnonTemplate name, tag rules                                       evidence: changelog 2024.1  confidence: medium
Settings / KeyBinding                                              evidence: options.xml, S17  confidence: high
```

Relationships: Patient 1-n Study, Study 1-n Series, Series 1-n Instance, Archive 1-n Study, Study n-n Keyword.
The data lives in local files and a local database. There are no user accounts or server.

## Feature matrix

See `features.csv`. Must: 30, should: 30, could: 14, skip: 4.

## Out of scope / needs a decision

- **Regulatory status: decided 2026-11-22.** It is a viewer only, and doctors make the diagnosis themselves. It ships with a "not a medical device" notice, the same position RadiAnt takes. FDA/CE clearance is out of scope.
- **Same UI: decided 2026-11-22.** It keeps the original's layout, workflow, toolbar order, default shortcuts and mouse mapping. The icons, logo, name and text are drawn and written fresh.
- **Security.** The original had CVEs for malformed DICOM and JPEG data in 2025 and 2026. Doctors open discs from strangers, so parse images with a maintained, fuzzed library and sandbox the decoders.
- **The name, logo, icons, manual text and translations.** Write your own. Its translations were made by its community and are not ours to reuse.
- **The paid CD/DVD autorun edition** with a custom logo. Rebuild it later as your own "portable" build if you want one. It is not part of the core.
- **There are already free viewers.** Weasis, OHIF Viewer, 3D Slicer and Horos (macOS) are open source. Check them before building from scratch: you could fork one or build on its libraries (cornerstone3D, dcmjs, DCMTK, GDCM, VTK/ITK).

## Size

Screens 21, flows 13, entities 11. Hard parts: (1) DICOM parsing and every codec (JPEG-LS, J2K/HTJ2K, RLE, YBR, multi-frame) done correctly and safely; (2) GPU 3D (MPR slabs, volume rendering, scalpel, STL) at RadiAnt's speed on 2000+ slices; (3) the DICOM networking stack (C-FIND/MOVE/GET/STORE SCP and SCU) against real hospital PACS systems; plus fusion and SUV maths, sync geometry and the regulatory question.
Size: **XL for full parity**, so rescope. The core 2D reading loop (F01–F04 plus F11) is **M**. Adding PACS and the archive makes it **L**. MPR, 3D VR, fusion, TIC and DSA add another **L**.
