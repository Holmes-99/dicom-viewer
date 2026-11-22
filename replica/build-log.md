# Build log

Run the viewer with `npm run dev` in `app/`, then open http://localhost:5173 (the design system page is at `#/design`).
Demo data: `npm run demo` (in `app/`) writes a synthetic CT study (no patient data) to `app/public/demo/`. It is not committed.

| screen | date | status | missing | harder than expected |
| --- | --- | --- | --- | --- |
| shell | 2026-11-22 | done | Tauri desktop wrapper (Rust is not installed on this PC); "coming soon" toolbar buttons for later milestones | Getting Cornerstone 5.19 running under Vite 8: CommonJS codecs needed pre-bundling, and xmlbuilder2 needed an `events` polyfill. |
| S01 start | 2026-11-22 | done | recent studies list | — |
| S02 2D viewer | 2026-11-22 | partial | cine, sync, reference lines, calibration, rotate/flip/invert/copy not checked in the browser, context menu (right drag is zoom for now) | The loader's new metadata path finds no pixel data in local files, so it runs on the dicom-parser path (`useLegacyMetadataProvider`). Recheck on the next Cornerstone upgrade. Measurement styles have to be merged into the defaults, otherwise the labels disappear. |
| S03 open series | 2026-11-22 | done | sort by time or file name | — |

## Vertical slice: what was checked in the browser (1440×900)

- Opened the demo study: one patient, one study, three series, 161 files indexed and sorted by slice position.
- Scrolled with the mouse wheel and the arrow keys. The overlay updated each time (image number, Z position, W/L, zoom).
- Applied the CT presets from the keyboard (lung, then mediastinum).
- Length measurement shows mm. The ellipse ROI shows area, mean, min, max and SD in HU. The lung mean read −850 HU, which matches the phantom.
- Switched to a 1×2 layout. Both panels refit. Chose a panel, opened F4, typed a filter, pressed Enter, and the series opened in that panel. Thumbnails show the panel number.
- The first-run notice blocks the app until "I understand" is ticked.
- No console errors.

## Known issues

- While a dialog is open, the panels behind it briefly show a different zoom (the dialog's scroll lock resizes the page). They return to normal when it closes.
- Measurement label colours are still the library's defaults (white, green when selected). The line colours use our tokens.
- Wheel scrolling moves one image per wheel event, with no acceleration. **VERIFY** against the original.
- The 390px width check is skipped: this is a desktop app with a minimum window size of 1024×768.
- **Screenshots for replica-diff are not saved yet.** The browser tool cannot write image files. `/replica-test` should capture S01–S03 with Playwright into `replica/clone-screens/`.

## Next

1. The rest of the must-haves:
   - cine
   - auto sync and reference lines
   - calibration
   - DICOM tags window (S12)
   - JPEG/BMP export
   - ZIP
   - codec test files (pydicom/GDCM public test data)
2. Install Rust and add the Tauri shell (`tauriSource` implementing the same `DataSource` interface).
