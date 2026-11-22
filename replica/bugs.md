# Bugs: DICOM viewer clone

Found by the Playwright suite in `app/e2e/` (run 1, build b9b9c6d, 2026-11-22). Chromium, 1440×900, local dev server.
Every bug below was reproduced by a failing test before the fix, and the same test passes after it.

| ID | severity | title | status |
| --- | --- | --- | --- |
| BUG-001 | S2 | Accented and non-Latin patient names show as garbage | fixed in 3bfde57 |
| BUG-002 | S2 | Auto sync sends the second panel to the wrong slice, and fast scrolling skips or jumps back | fixed in 9ffac2c |
| BUG-003 | S3 | DICOM tags (F2) is empty right after a study opens | fixed in 9ffac2c |
| BUG-004 | S3 | Export can cancel its own download for big files | fixed in 39d161b |

**Run 2 (after the fixes): 41 of 41 automated cases pass.** The type check is clean. Lint shows 2 older warnings.

---

### BUG-001: Accented and non-Latin patient names show as garbage

- Severity: S2
- Flow / case: F01 / F01-E4
- Screen: S02 viewer overlay, S03 open series (F4), S12 DICOM tags
- Build: b9b9c6d  Browser / device: Chromium (Playwright), 1440px

Steps
1. Open files → pick a study whose Specific Character Set is `ISO_IR 192` (UTF-8) and whose patient name has accents, for example `Ångström-Müller`.
2. Look at the top-left overlay, then press F4.

Expected: the name reads `Ångström-Müller…`, the same as it was written.
Actual: it shows `Ã…ngstrÃ¶m-MÃ¼ller…`. The emoji turns into four junk characters.
Evidence: failing test `F01-H2 + F01-E4 + F01-E5 open files: long UTF-8 name, two patients`.
Suspected cause: the DICOM parser reads text one byte per character and ignores (0008,0005). Every non-ASCII name was affected, including Latin-1 files. Names are what staff use to confirm they have the right patient, so this is S2 with no workaround.
Fix: `app/src/data/charset.ts` decodes PN/LO/SH/ST/LT/UT/UC values with the file's character set (UTF-8, Latin-1…9, Cyrillic, Greek, Arabic, Hebrew, Thai, Japanese, Korean, Chinese). It is used for names and descriptions in the index and in the tags dialog.
Status: fixed in 3bfde57

### BUG-002: Auto sync sends the second panel to the wrong slice, and fast scrolling skips or jumps back

- Severity: S2
- Flow / case: F04 / F04-H2
- Screen: S02 viewer, 1×2 layout
- Build: b9b9c6d  Browser / device: Chromium (Playwright), 1440px

Steps
1. Open the demo. Layout → 1×2. Show "Axial 2.5 mm mediastinum" in panel 2.
2. Click panel 1 and press ↓ twelve times quickly.

Expected: both panels show image 13 of 80 at the same Z.
Actual: across runs, panel 1 ended on image 6, 13 or 14 (steps lost or added). With one-way sync, panel 2 went to image 65, the mirror position.
Evidence: failing test `F04-H1 + F04-H2 two axials side by side stay in sync`. Three runs gave three different wrong results.
Suspected cause: the renderer's built-in image-slice synchronizer treats these stack panels as volume slices and mirrors the index (`n − i − 1`). Because every panel was both source and target, a follower's mirrored, late echo pulled the panel being scrolled. Comparing the same level in two series is the point of sync, so this is S2.
Fix: our own one-way sync in `app/src/viewer/engine.ts`. The panel in use drives the others, and each follower jumps to its image nearest in patient position. The wheel now makes a panel the one in use.
Status: fixed in 9ffac2c

### BUG-003: DICOM tags (F2) is empty right after a study opens

- Severity: S3
- Flow / case: F11 / F11-H3
- Screen: S12 DICOM tags
- Build: b9b9c6d  Browser / device: Chromium (Playwright), 1440px

Steps
1. Open the demo study. Press F2 without clicking a panel.

Expected: the tags of image 1 are listed.
Actual: "Select a panel that shows an image." and Copy all is disabled. Clicking the panel and pressing F2 again works (the workaround).
Evidence: failing test `F11-H3 tags: search and copy a value`.
Suspected cause: the dialog read the image id only from the renderer, which had not reported it yet.
Fix: fall back to the series' own image list.
Status: fixed in 9ffac2c

### BUG-004: Export can cancel its own download for big files

- Severity: S3
- Flow / case: F11 / F11-H2
- Screen: S13 export
- Build: b9b9c6d

Steps
1. Ctrl+S → BMP → Export.

Expected: the file downloads.
Actual: the download link was revoked 1 s after the click. A big BMP (3.4 MB for one panel at 1440 px) can still be handing over then, and the download is cancelled. JPEG and PNG are a workaround.
Evidence: code review while chasing the F11-H2 failure. The F11-H2 failure itself turned out to be the test browser (see "to check").
Fix: the anchor is attached to the page, and the link is kept for 60 s.
Status: fixed in 39d161b

## Test bugs (not app bugs), fixed in the specs

- F01-N1: `getByLabel('Password')` also matched the "Show password" checkbox. It now uses the textbox role.
- F02-H6: read the image number while the last cine frame was still being drawn. It now waits for that frame before comparing.
- F04-E1: "Auto sync: on" also matched the "Auto sync: on options" menu button. It now matches the exact name.
- F11-H2: Playwright's Chromium cancels blob downloads of a few MB, even from a bare page (checked: 100 KB ok, 5 MB cancelled). The test now checks the BMP bytes the page produces (header, size, 24-bit) and the file name.

## To check (not reproduced)

- A real, multi-MB BMP download in desktop Chrome and Edge. The automated browser cannot do it (see above). Checked by hand: not yet.
- Cine at 30 fps in a visible window (F02-E4). The test browser throttles frames, so speed is not measured.
- Drag a folder from Explorer (F01-H4) and whole-series export to a folder (F11-E2). Both need the OS file dialog or drag source and are not automated.
