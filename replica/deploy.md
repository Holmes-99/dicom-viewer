# Deploy checklist: free DICOM viewer (name TBD)

Date: 2026-11-22  Commit: e1f1276 (+ feature notes corrected)  Go from user: **not asked: preflight failed**

**Verdict: not ready to release.** Three checks fail. The two big ones: the desktop app itself (installer, portable, Mac) is not built yet, and the app has no name of its own yet. Nothing was published.

This is a desktop app (ground rules 1 and 6), so this skill's web steps (database, Stripe, OAuth, email, domain DNS, uptime checks, analytics) **do not apply**. Releasing means uploading the installer, the portable exe and the `.dmg` to GitHub Releases on `Holmes-99/dicom-viewer`. The adapted steps are below.

## Preflight (all must pass)

- [x] **e2e suite green: 41 passed / 41** (`npx playwright test`, 2.3 min, Chromium)
- [x] **no open S1 or S2 bugs.** BUG-001 to 004 are all fixed (`bugs.md`).
- [ ] **parity: must-haves 23 / 35 done, feature score 51.5 / 100.** FAIL. Missing:
  - Desktop app: Windows installer, portable Windows version, Mac app, patient-CD folder (milestones D1–D3)
  - The fully-offline lock, enforced and tested (D1)
  - Cine real frame rate measured; codec test files for JPEG, JPEG-LS, J2K/HTJ2K, RLE/deflate and US YBR colour
  - Reading DICOMDIR on discs; a fuzz suite for damaged files
- [ ] **rebrand sweep clean.** FAIL. `sweep.py` exits 2: there is no `replica/brand.json` because the app has no name, icon or colours of its own yet (`/replica-brand` has not run). Per the rules, nothing ships before this is clean.
- [x] store listing: n/a (not shipping to the Microsoft Store or Mac App Store)
- [x] **production build passes** (`npm run build`, 2.5 s). Warning: the main bundle is 4.5 MB (1.3 MB gzipped). That's fine for a desktop app loading from disk.
- [ ] **privacy statement.** Not written. An offline app collects nothing, so this is a short page ("this app never connects to the internet; images never leave your computer") in the README, the About box and the release notes.
- [x] account deletion: n/a (no accounts)
- [ ] **app icon, window title, installer name are yours.** FAIL. They need the brand. The current title and icons are placeholders.

## Release (desktop): to do once preflight passes

Claude prepares the builds and the release notes. Holmes-99 makes the account and payment decisions.

- [ ] `npm run dist` builds all four outputs: `…-Setup-x.y.z.exe`, `…-Portable-x.y.z.exe`, `…-x.y.z.dmg`, and the CD folder template (milestone D2)
- [ ] the installer installs per user without admin rights, `.dcm` files open on double-click, and uninstall removes everything
- [ ] smoke test on a clean Windows 10 and 11 PC, and on a Mac (Apple Silicon and Intel): open the demo, a folder, a CD and a ZIP; offline check passes
- [ ] **code signing (Holmes-99 decides):**
  - Windows certificate, about US$100–400/year. Without it: a SmartScreen "unknown publisher" warning.
  - Apple Developer, US$99/year, for notarization. Without it: right-click → Open the first time.
  - The app works either way.
- [ ] version number and changelog
- [ ] GitHub Release with the four files plus SHA-256 checksums, published only on Holmes-99's go
- [ ] optional: a download page (GitHub Pages, free). No domain needed. If you buy one later, I'll write the DNS records then.

## Watch (first week): adapted

There are no servers to monitor and no telemetry (ground rule 6). Feedback comes from people:
- [ ] GitHub Issues open for bug reports, with a template: Windows/Mac version, what was opened (CD, folder, ZIP), steps, a screenshot with patient data hidden
- [ ] a note in the release: never attach real patient images to an issue

## Next

1. `/replica-build` D1–D3 (the desktop shell, packaging, the patient CD), then the remaining must-haves
2. `/replica-brand`: a name, icon and colours, which also creates `brand.json` for the sweep
3. Run `/replica-deploy` again
