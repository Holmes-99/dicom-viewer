# Test plan: DICOM viewer clone

Build: b9b9c6d  Date: 2026-11-22  Env: local dev server (`npm run dev`), Chromium, 1440×900 unless noted.
Data: the synthetic demo study (`npm run demo`), plus test files the suite generates itself in `app/e2e/.fixtures/`: odd names, transfer syntaxes, damaged files and ZIPs. No real patient data is used.

Run it with `npx playwright test` in `app/`. Every spec fails on any console error, on any 5xx response, and on axe accessibility violations on the screens it opens.

**Not in scope yet (not built):** F05 PACS, F06 archive, F07 3D, F08 fusion, F09 TIC, F10 DSA, F12 anonymize, F13 key bindings.
**Not applicable:** a second user's data, sessions, payments and time zones. This is a single-user local app: DICOM dates have no zone, and nothing is sent anywhere.

`auto` = Playwright spec · `manual` = checked by hand in the browser pane · result filled after the run.

## Results (2026-11-22)

- Run 1: 41 automated tests, 34 passed, 7 failed. 4 failures were real bugs (BUG-001 to 004, see `bugs.md`); 3 were mistakes in the tests.
- Run 2, after the fixes: **41 / 41 pass**. Every `e2e` case below passes.
- `manual` cases (F01-H4 folder drag, F02-E4 real frame rate, F11-E2 series export to a folder): **not run yet**.

## F01 Open a study and read it

| case | type | steps | expected | auto | result |
| --- | --- | --- | --- | --- | --- |
| F01-H1 | happy | first visit → tick "I understand" → Continue → Try the demo study | 4 series thumbnails; panel 1 shows the lung axial, image 1 of 80; patient name in the overlay | e2e | |
| F01-H2 | happy | Open files → pick DICOM files | their series appear and the largest one is shown | e2e | |
| F01-H3 | happy | Open ZIP archive → pick a plain ZIP | the series in the ZIP open | e2e | |
| F01-H4 | happy | drag a folder from Explorer onto the window | opens like Open folder | manual | |
| F01-E1 | edge: nothing usable | pick only non-DICOM files | "No images found" message; still on the start screen | e2e | |
| F01-E2 | edge: mixed | DICOM files plus a text file | opens; "1 files skipped" warning | e2e | |
| F01-E3 | edge: damaged file | a DICOM truncated in the middle of the header | skipped and counted; no crash, no console error | e2e | |
| F01-E4 | edge: long name, accents, emoji | patient name of 64 characters with accents and an emoji (UTF-8, ISO_IR 192) | name shown correctly in the overlay and the F4 list; the page does not overflow | e2e | |
| F01-E5 | edge: two patients | files from two patients in one pick | F4 lists both patients' series | e2e | |
| F01-E6 | edge: implicit VR little endian | open an implicit-VR file | image renders | e2e | |
| F01-E7 | edge: explicit VR big endian | open a big-endian file | image renders, or a clear "cannot decode" message | e2e | |
| F01-E8 | edge: multi-frame | one file with 3 frames | panel shows image 1 of 3; scrolling reaches 3 | e2e | |
| F01-E9 | edge: refresh mid-flow | open the demo → reload | back to the start screen (nothing is stored; expected) and the notice is not shown again | e2e | |
| F01-E10 | edge: keyboard only | Tab to "Try the demo study" → Enter → arrows scroll | study opens and scrolls without a mouse | e2e | |
| F01-E11 | edge: smallest window | 1024×768 with the demo open | no horizontal page scroll | e2e | |
| F01-N1 | negative: wrong ZIP password | AES ZIP → wrong password → right password | asked again with "did not work"; then opens | e2e | |
| F01-N2 | negative: cancel password | AES ZIP → Cancel | "Not opened … needs a password"; nothing opened | e2e | |
| F01-N3 | negative: notice not accepted | first visit → Continue without ticking | Continue is disabled | e2e | |

## F02 Adjust the image

| case | type | steps | expected | auto | result |
| --- | --- | --- | --- | --- | --- |
| F02-H1 | happy | demo → mouse wheel down 5 × on the panel | image number goes up; Z changes | e2e | |
| F02-H2 | happy | keys 2, 3 | W 1500 L −600, then W 400 L 40 | e2e | |
| F02-H3 | happy | Zoom tool (Z) → drag up | zoom % changes; Esc returns to the fitted zoom | e2e | |
| F02-H4 | happy | I | the image is inverted (a bright pixel becomes dark); I again restores it | e2e | |
| F02-H5 | happy | Ctrl+R, Ctrl+H, Esc | image rotates and flips, then resets; no errors | e2e | |
| F02-H6 | happy | C → wait → C | image number advances while playing, stops when paused; cine bar shown | e2e | |
| F02-E1 | edge: ends | Home, End, then ArrowDown at the end | 1 of 80, 80 of 80, stays at 80 | e2e | |
| F02-E2 | edge: overlay off | Ctrl+T; then Hide patient data | corner text hidden; then the name is replaced by "Patient data hidden" | e2e | |
| F02-E3 | edge: cine on one image | show the scout → C | "Nothing to play" message | e2e | |
| F02-E4 | edge: real frame rate | cine at 30 fps in a visible window | about 30 images per second | manual | |

## F03 Measure

| case | type | steps | expected | auto | result |
| --- | --- | --- | --- | --- | --- |
| F03-H1 | happy | L → drag across the image | label in mm | e2e | |
| F03-H2 | happy | E → ellipse inside the right lung | mean about −850 HU | e2e | |
| F03-H3 | happy | A → three clicks | label in degrees | e2e | |
| F03-H4 | happy | draw a line → Length menu → Calibrate… → 70 → Apply | the line reads 70.0 mm | e2e | |
| F03-E1 | edge: calibrate without a line | Calibrate… with no line drawn | explains how; Apply disabled | e2e | |
| F03-E2 | edge: bad calibration input | type 0, then "abc" | error shown; Apply disabled | e2e | |
| F03-N1 | negative: no pixel spacing | measure on the scout (no spacing in the file) | label in px, not mm | e2e | |

## F04 Compare series

| case | type | steps | expected | auto | result |
| --- | --- | --- | --- | --- | --- |
| F04-H1 | happy | Layout → 1×2 → select panel 2 → F4 → type "mediastinum" → Enter | panel 2 shows the mediastinum series | e2e | |
| F04-H2 | happy | 1×2 lung and mediastinum → scroll panel 1 | panel 2 follows to the same Z | e2e | |
| F04-H3 | happy | 1×2 axial and coronal; select coronal | a reference line is drawn on the axial panel and moves when the coronal panel scrolls | e2e | |
| F04-E1 | edge: sync off | turn auto sync off → scroll panel 1 | panel 2 stays put | e2e | |
| F04-E2 | edge: drag thumbnail | drag the coronal thumbnail onto panel 2 | panel 2 shows the coronal series | e2e | |
| F04-E3 | edge: 5×5 | Layout 5×5 | 25 panels; empty ones say "Drop a series here"; no errors | e2e | |
| F04-E4 | edge: F4 no match | F4 → type "zzz" | "Nothing matches" | e2e | |
| F04-E5 | edge: other patient | 1×2 demo axial plus the other patient's series → scroll | not synced (different frame of reference) | e2e | |

## F11 Export, copy, tags

| case | type | steps | expected | auto | result |
| --- | --- | --- | --- | --- | --- |
| F11-H1 | happy | Ctrl+S → Export (JPEG, current image) | downloads CT_Se3.jpg, a valid JPEG | e2e | |
| F11-H2 | happy | Ctrl+S → BMP → Export | downloads CT_Se3.bmp starting with "BM" | e2e | |
| F11-H3 | happy | F2 → search "pixel spacing" → Enter on the row | row shown; value 1.25\1.25 copied | e2e | |
| F11-H4 | happy | Ctrl+C | a PNG is on the clipboard | e2e | |
| F11-E1 | edge: unsafe file name | file name `a/b:c*` | saved as `a_b_c_.jpg` | e2e | |
| F11-E2 | edge: whole series | Export whole series → pick a folder | 80 numbered files in the folder | manual | |
| F11-E3 | edge: tags search no match | F2 → "zzz" | "Nothing matches" | e2e | |
