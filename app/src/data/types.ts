// Session tree: what `open_paths` returns in architecture.md. The Tauri core will return the same shape.
import type { AskPassword } from './zip'

export type Instance = {
  imageId: string            // how the renderer loads it ('dicomfile:3' in the browser, 'dcm://…' under Tauri)
  sopUid: string
  instanceNumber: number | null
  position: [number, number, number] | null
  orientation: number[] | null
  frames: number
  transferSyntax: string
  fileName: string
}

export type Series = {
  seriesUid: string
  studyUid: string
  modality: string
  number: number | null
  description: string
  frameOfReference: string | null
  rows: number | null
  cols: number | null
  instances: Instance[]       // sorted for display
  /** imageIds expanded per frame, in display order */
  imageIds: string[]
}

export type Study = {
  studyUid: string
  date: string
  time: string
  description: string
  accession: string
  modalities: string[]
  series: Series[]
}

export type Patient = {
  key: string
  name: string
  id: string
  birthDate: string
  sex: string
  studies: Study[]
}

export type Session = {
  patients: Patient[]
  skipped: { fileName: string; reason: string }[]
}

export type OpenProgress = { done: number; total: number }

/** Implemented by webSource (browser) now and tauriSource (Rust core) later. Screens use only this. */
export interface DataSource {
  /** ZIP files in the list are unpacked; `askPassword` is called for encrypted ones */
  openFiles(files: File[], onProgress?: (p: OpenProgress) => void, askPassword?: AskPassword): Promise<Session>
  openDemo(onProgress?: (p: OpenProgress) => void): Promise<Session>
  /** raw header for the DICOM tags window (S12) */
  getHeader(imageId: string): unknown
  /** the original file an image came from, unchanged (for the disc folder, D3) */
  getFile(imageId: string): File | undefined
  closeAll(): void
}

export const allSeries = (s: Session | null) => (s ? s.patients.flatMap((p) => p.studies.flatMap((st) => st.series)) : [])
export const findSeries = (s: Session | null, uid: string | null) => allSeries(s).find((x) => x.seriesUid === uid) ?? null
export const studyOf = (s: Session | null, seriesUid: string) => {
  for (const p of s?.patients ?? []) for (const st of p.studies) if (st.series.some((x) => x.seriesUid === seriesUid)) return { patient: p, study: st }
  return null
}
