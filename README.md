# DICOM Viewer

A free, offline desktop viewer for medical images (CT, MR, X-ray, ultrasound, PET), built for doctors and medical staff.

> Not a certified medical device. It displays images; the clinician is responsible for any diagnosis.

## Layout

- `app/`: the UI (React + TypeScript + Vite + Tailwind). Run it with `npm install` and then `npm run dev` inside `app/`.
- `replica/`: planning docs: feature map (`recon.md`, `features.csv`), architecture and database schema (`architecture.md`, `schema.sql`), and the design system (`design/`).

## Status

The design system and UI primitives are done. The viewer core (opening DICOM files, the image viewport) is in progress.
