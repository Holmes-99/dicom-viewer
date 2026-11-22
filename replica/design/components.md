# Component specs

Tokens: `tokens.json` → `tokens.css` (via `gen-tokens.mjs`). Tailwind utilities: `bg-surface`, `text-fg`, `text-muted`, `border-border`, `rounded-md`, `text-sm`, `shadow-pop`.
Icons: **Lucide** (ISC licence) at 20px, stroke 1.75. No icons or artwork are taken from the original.
Base: Radix primitives (`radix-ui`) for menus, dialogs, tooltips, sliders and context menus, so keyboard and screen-reader behaviour comes built in.
Density: a dense desktop UI with a 14px base and 28px menu rows. Mouse first, but everything works from the keyboard.

> **Provisional layout.** These specs follow a standard dark radiology viewer: toolbar on top, series thumbnails on the left, a black panel grid filling the rest. Toolbar order, default shortcuts and mouse mapping have to be checked against the installed original before release (recon source 8). Each spot that needs checking says **VERIFY**.

---

```
App shell
  layout    toolbar (44px, top) / thumbnail bar (120px, left, collapsible) / panel grid (fills the rest)
  tokens    bg bg; toolbar bg surface + bottom border border; grid gap 2px on bg
  modes     normal, full screen (F11), distraction-free (Alt+Shift+Enter: hides toolbar and thumbnail bar)
  a11y      landmarks: toolbar role=toolbar, thumbnails role=listbox, grid role=grid
  used on   S01, S02
```

```
ToolButton
  variants  plain, split (icon + chevron that opens a menu: presets, layouts, tool families), toggle
  size      36x36 (icon 20); split chevron 14px wide
  states    default, hover (surface-hover), pressed/active tool (accent-strong bg, on-accent icon),
            focus-visible (2px focus ring, inset), disabled (text-disabled)
  tokens    radius md, motion fast
  a11y      real <button>, aria-pressed for toggles, aria-haspopup for split, tooltip with name + shortcut
  used on   toolbar, S07, S08 toolbars
  VERIFY    button order and grouping against the original
```

```
Toolbar
  groups    open | layout, series | navigate (scroll, zoom, pan, W/L) | measure | view (rotate, flip, invert, reset) |
            sync, cine | 3D (MPR, VR, fusion) | export, print | tags | help
  states    a button can be hidden per user setting (2024.2 parity)
  a11y      arrow keys move between buttons (roving tabindex), Tab leaves the toolbar
```

```
Menu (dropdown and context menu)
  items     plain, checkable, radio group, submenu, separator, label; right column shows the shortcut
  size      row 28px, min width 200px, padding 4px
  states    highlighted (surface-hover), disabled, checked (check icon)
  tokens    bg surface-raised, shadow pop, radius md, text sm
  a11y      Radix DropdownMenu / ContextMenu: arrows, typeahead, Esc closes, focus returns to the trigger
  used on   toolbar splits, viewport right-click, thumbnail right-click, archive row right-click
```

```
Tooltip
  content   name + shortcut in a mono kbd chip
  delay     500ms, instant between neighbours
  tokens    bg surface-raised, text xs, shadow pop
```

```
SeriesThumbnail
  parts     96x96 image (black bg), series number + modality badge top-left, image count bottom-right, description below (2 lines max)
  states    loading (pulse), ready, active (accent border 2px), shown in another panel (small panel-index dot),
            failed (danger icon + "Can't read this series"), hidden-patient-data (no change)
  a11y      role=option, aria-selected; Enter opens in the active panel; drag onto a panel to open there
  used on   thumbnail bar, S03
```

```
Viewport (image panel)
  parts     canvas on viewport black; overlay text in 4 corners; orientation markers (L/R/A/P/H/F) mid-edges;
            scale bar on the right; slice scrollbar on the right edge; annotation layer (SVG)
  overlay   overlay-text 12px with a 1px black text-shadow; top-left patient, top-right study,
            bottom-left W/L + zoom, bottom-right slice n/total + thickness + position
  states    empty ("Drop a series here"), loading (spinner + %), rendered, active (1px accent border),
            synced (sync icon in a corner, sync colour), cine playing, error (danger text in centre),
            uncalibrated (amber "uncalibrated" next to measurements), hide-patient-data (top-left blanked)
  tokens    annotation, annotation-active, refline, sync
  a11y      focusable; arrow keys / PageUp / PageDown / Home / End scroll slices; the readout is announced politely
  used on   S02, S07 (3 planes), S08, S09
  VERIFY    corner content and default mouse mapping (left = active tool, right = W/L?, middle = pan?, wheel = scroll)
```

```
Measurement graphics
  tools     length, ratio, angle, Cobb, deviation, ellipse, rectangle, polygon open/closed, ellipsoid, arrow, pen, 3D cursor
  look      line 1.5px annotation colour, 1px black halo for contrast on bright images; handles 6px squares;
            the label box sits next to the shape (black 60% bg, overlay-text 12px)
  states    drawing (dashed), done, hovered (handles shown), selected (annotation-active), dragging
  values    length "23.4 mm"; ellipse "Mean 42 HU / SD 12 / Min / Max / Area 3.1 cm²"; PET "SUVbw max 7.2"
  keys      Esc cancels a drawing, Delete removes the selected one, Ctrl+Delete removes all in this panel
```

```
LayoutPicker
  form      a 5x5 grid of 16px cells in a popover; hovering highlights rows x cols; the label reads "2 x 3"
  states    hover, current (accent outline)
  a11y      arrow keys move, Enter applies
```

```
CineControl
  parts     play/pause button, fps slider (1–60), fps number, loop/bounce toggle
  where     floating bar at the bottom of the active panel while cine is on
  a11y      Space play/pause, slider with aria-valuetext "15 frames per second"
```

```
Button
  variants  primary (accent-strong / on-accent), secondary (surface-raised + border), ghost, danger
  sizes     sm 24px, md 28px (default in dialogs), lg 32px
  states    default, hover, active, focus-visible (2px focus ring offset 1), disabled, loading (spinner, label kept)
  tokens    radius md, text sm/600
  a11y      real <button>; Enter = primary, Esc = cancel in dialogs
```

```
TextInput / NumberInput / Select / Checkbox / Radio
  size      28px high, padding 0 8px, text sm
  tokens    bg bg, border border-input, radius sm, focus ring focus
  states    default, hover, focus, disabled, invalid (danger border + message below), read-only
  number    ↑/↓ step, Shift = ×10; used for W/L, fps, port
  a11y      every input has a <label>; errors use aria-describedby
```

```
Dialog
  sizes     sm 360, md 480, lg 720, full (archive, PACS)
  parts     title bar (lg/600), body, footer (right-aligned: secondary, primary)
  tokens    bg surface-raised, shadow dialog, radius lg, backdrop rgba(0,0,0,.5)
  a11y      Radix Dialog: focus trap, Esc closes, title is aria-labelledby
  used on   S13 export, S14 print, S15 anonymize, S16 send, S17 bindings, S18 settings, S06 PACS nodes
```

```
DataTable
  features  sortable headers (aria-sort), resizable columns, sticky header, multi-select (Ctrl/Shift), keyboard rows
  row       24px, zebra off, hover surface-hover, selected accent-strong 35% bg
  states    loading (skeleton rows), empty (message + action, e.g. "No studies yet. Import from disc."),
            error (danger message + Retry), filtered-empty ("Nothing matches 'smith'")
  used on   S03, S04, S05, S12, S06
```

```
Progress and Toast
  progress  thin bar (4px) + label "Importing 312 / 1,204 files"; can be cancelled
  toast     bottom-right, 360px, success / warning / danger icon; auto-dismiss 5s unless it has an action
  a11y      role=status (polite); errors role=alert
```

```
Notice (medical-device disclaimer)
  where     first launch (dialog, must be acknowledged) + About + a small persistent line in the About menu
  text      written fresh; says it is not a certified medical device and the clinician is responsible for any diagnosis
```

```
DICOM tag tree (S12)
  columns   tag (mono), name, VR, length, value
  features  search box filters as you type, expand sequences, pin rows (colour dot), copy selected/all, save raw value
```
