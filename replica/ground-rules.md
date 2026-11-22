# Ground rules

Agreed with Holmes-99 on 2026-11-22. These come before every other plan in `replica/`. If a plan disagrees with these rules, the rules win until Holmes-99 changes them.

## What we are building

1. **A desktop application, not a website.** It is installed (or run portable) on **Windows and Mac**, and opens from the Start menu, the Dock, or by double-clicking a DICOM file.
2. **The same as RadiAnt DICOM Viewer, but free.** Same layout, toolbar order, shortcuts, mouse mapping, dialogs and workflow, because staff don't want to relearn. When RadiAnt behaves a certain way, we behave that way too. When we can't tell, the code says `VERIFY` and we check against a real copy.
3. **Free.** No price, no trial, no account, no sign-in, no ads, no nag screens.
4. **A viewer.** It shows images and measurements. The doctor makes the diagnosis. The "not a certified medical device" notice stays.
5. **Three ways to ship:** a Windows installer, a portable Windows version, and a viewer that goes on patient CDs. Mac gets a `.dmg`.

## Patient data and the network

6. **Fully offline.** The app never connects to the internet: no update checks, telemetry, crash reports, fonts or CDN files. This is enforced in code (the offline lock in `architecture.md`) and checked by a test.
7. **Images stay on the computer.** Opened files are only read, never changed, moved or uploaded. Temporary copies are deleted when the app closes.
8. **No real patient data in development.** Use the synthetic demo study, the generated test files and public de-identified sample sets. Never use real patient files in tests, screenshots or commits.
9. **Open decision: PACS.** Should the app talk to a hospital's own image server over the local network, as RadiAnt can? It would be off by default and never reach the internet. Until Holmes-99 decides, PACS is not built.

## Clean room

10. **Never copy RadiAnt's code, icons, logo, images, help text or wording.** We match what it does, not how it is written. All text and icons are our own. The app gets its own name (`/replica-brand`).
11. **Never test against, scrape or load anything from RadiAnt's servers.** Using an installed copy by hand to see how it behaves is fine.

## How we work

12. **Commits are by Holmes-99 only.** No co-author lines or mentions of Claude in commits, pull requests or files.
13. **Commit small and often:** one commit per fix, screen or step, with a plain message saying what changed.
14. **Push to GitHub (`Holmes-99/dicom-viewer`) only when Holmes-99 says so.**
15. **Tests pass before a commit.** The type check is clean, and the Playwright suite passes or the failure is written up in `bugs.md`. Every real bug gets a test that failed first.
16. **Big changes are agreed first.** A change of platform, framework or scope is proposed to Holmes-99 before any code is written.
17. **The replica pack is the process.** recon → architect → design → build → test → diff, and so on. Its files in `replica/` are kept current.
