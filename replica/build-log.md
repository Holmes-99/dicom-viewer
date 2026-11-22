# Build log

Run the viewer with `npm run dev` in `app/`, then open http://localhost:5173 (the design system page is at `#/design`).
Demo data: `npm run demo` (in `app/`) writes a synthetic CT study (no patient data) to `app/public/demo/`. It is not committed.

| screen | date | status | missing | harder than expected |
| --- | --- | --- | --- | --- |
| shell | 2026-11-22 | done | Tauri desktop wrapper (Rust is not installed on this PC); "coming soon" toolbar buttons for later milestones | Getting Cornerstone 5.19 running under Vite 8: CommonJS codecs needed pre-bundling, and xmlbuilder2 needed an `events` polyfill. |
| S01 start | 2026-11-22 | done | recent studies list | — |
| S02 2D viewer | 2026-11-22 | partial | cine frame rate not measured; copy to clipboard and the angle tool not checked; context menu (right drag is zoom for now) | The loader's new metadata path finds no pixel data in local files, so it runs on the dicom-parser path (`useLegacyMetadataProvider`). Recheck on the next Cornerstone upgrade. Measurement styles have to be merged into the defaults, otherwise the labels disappear. |
| S03 open series | 2026-11-22 | done | sort by time or file name | — |
| S02 sync + reference lines | 2026-11-22 | done | manual sync across studies (should) | The loader only knows a slice's position after it has loaded the pixels, so sync crashed on unloaded slices. We now serve positions from the headers parsed at open time (`planeFromHeader` in `webSource.ts`). |
| S02 calibration | 2026-11-22 | done | the label reads "70.0 mm User" (the library's wording; reword later) | Cornerstone's calibration store is not wired into metadata lookups by default, and its `scale` means pixels per mm, not a ratio. Both are handled in `engine.ts` / `actions.ts`. |
| S12 DICOM tags | 2026-11-22 | done | pin/colour tags, save a raw value to a file | Tag names come from a hand-written list of about 90 common tags; any other tag shows its number. A full dictionary can come later. |
| S13 export | 2026-11-22 | partial | MP4/video, DICOM, STL (all "should"); overlay text is not burned into the image | The browser has no BMP encoder, so we write BMP ourselves. A whole series goes into a folder you pick (the File System Access API, available in WebView2). |
| F01 ZIP open | 2026-11-22 | done | — | zip.js handles AES; a wrong password asks again. |

## Vertical slice: what was checked in the browser (1440×900)

- Opened the demo study: one patient, one study, three series, 161 files indexed and sorted by slice position.
- Scrolled with the mouse wheel and the arrow keys. The overlay updated each time (image number, Z position, W/L, zoom).
- Applied the CT presets from the keyboard (lung, then mediastinum).
- Length measurement shows mm. The ellipse ROI shows area, mean, min, max and SD in HU. The lung mean read −850 HU, which matches the phantom.
- Switched to a 1×2 layout. Both panels refit. Chose a panel, opened F4, typed a filter, pressed Enter, and the series opened in that panel. Thumbnails show the panel number.
- The first-run notice blocks the app until "I understand" is ticked.
- No console errors.

## Must-haves round 2: what was checked in the browser

The demo study now also has a coronal series (series 5, 48 slices, same frame of reference), so reference lines have a crossing plane.

- **Cine.** C starts and pauses playback. The bar shows the speed slider (1–60 fps), loop or bounce, and close. Playback advanced through the series, but the test browser was hidden and throttled its timers, so the real frame rate is unmeasured.
- **Reference lines.** With axial in panel 1 and coronal in panel 2, the coronal plane is drawn on the axial image. Scrolling the coronal series 10 slices moved the line.
- **Auto sync.** With lung and mediastinum axials side by side, scrolling one moved the other to the same slice (both at Z 68.8 mm).
- **Calibration.** A 140 mm line calibrated to 70 mm reads 70.0 mm. Calibrating again on an already calibrated series also gives the right result.
- **DICOM tags (F2).** 46 tags are listed with names and VRs, and the transfer syntax is named in words. The tags match the slice on screen.
- **Rotate, flip, invert, reset.** Ctrl+R, Ctrl+H, I and Esc each change and then restore the renderer state.
- **ZIP.** A plain ZIP and an AES-256 ZIP both unpack byte for byte. A wrong password asks again, and Cancel stops with a clear message.
- **Export.** The JPEG and BMP encoders produce valid files from the live panel (1130×905). Ctrl+S opens the dialog with the name `CT_Se3`, which contains no patient data.
- After a fresh run there were no new console errors. Type check clean, lint has 0 errors.

## Known issues

- While a dialog is open, the panels behind it briefly show a different zoom (the dialog's scroll lock resizes the page). They return to normal when it closes.
- Measurement label colours are still the library's defaults (white, green when selected). The line colours use our tokens.
- Wheel scrolling moves one image per wheel event, with no acceleration. **VERIFY** against the original.
- The 390px width check is skipped: this is a desktop app with a minimum window size of 1024×768.
- **Screenshots for replica-diff are not saved yet.** The browser tool cannot write image files. `/replica-test` should capture S01–S03, S12 and S13 with Playwright into `replica/clone-screens/`.
- Panels now refit on a timer, not an animation frame. Animation frames stop while the window is hidden, which left the panels stretched after a layout change.
- The toolbar scrolls sideways when it doesn't fit (at 1024 px it was 22 px too wide). **VERIFY** how the original handles a narrow window.
- Shortcuts to check against the original: C for cine, F2 for tags, Ctrl+S for export. Also check whether auto sync starts on.

## Next

Must-haves: **20 of 30 done, 10 partial, 0 missing.**

1. Close the partials:
   - Codec test files (public pydicom/GDCM test data) for JPEG, JPEG-LS, J2K, HTJ2K, RLE, big endian, multi-frame and US colour.
   - Use DICOMDIR on discs.
   - Measure the cine frame rate in a visible window.
   - Check the angle tool and copy to clipboard.
2. `/replica-test`: Playwright end-to-end tests for F01–F04 and F11, plus the reference screenshots.
3. Install Rust and add the Tauri shell (`tauriSource` implementing the same `DataSource` interface).
