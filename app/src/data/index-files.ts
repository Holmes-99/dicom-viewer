import dicomParser, { type DataSet } from 'dicom-parser'
import type { Instance, Patient, Series, Session, Study } from './types'
import { text } from './charset'

export type Parsed = { file: File; imageId: string; ds: DataSet }

const str = (ds: DataSet, tag: string) => (ds.string(tag) ?? '').trim()
/** names and descriptions: decoded with the file's character set */
const txt = (ds: DataSet, tag: string) => text(ds, tag).trim()
const nums = (ds: DataSet, tag: string) => {
  const s = ds.string(tag)
  if (!s) return null
  const v = s.split('\\').map(Number)
  return v.every((n) => Number.isFinite(n)) ? v : null
}
const int = (ds: DataSet, tag: string) => {
  const n = parseInt(ds.string(tag) ?? '', 10)
  return Number.isFinite(n) ? n : null
}

/** Reads a file header. Throws on anything that is not DICOM Part 10 (or raw DICOM with a known layout). */
export async function parseHeader(file: File): Promise<DataSet> {
  const buf = new Uint8Array(await file.arrayBuffer())
  // untilTag stops before pixel data: headers only, cheap and safer.
  return dicomParser.parseDicom(buf, { untilTag: 'x7fe00010' })
}

export function isDicomDir(ds: DataSet) {
  return str(ds, 'x00020002') === '1.2.840.10008.1.3.10'
}

/** Groups parsed files into Patient -> Study -> Series and sorts each series for display. */
export function buildSession(parsed: Parsed[], skipped: Session['skipped']): Session {
  const patients = new Map<string, Patient>()
  const studies = new Map<string, Study>()
  const series = new Map<string, Series>()

  for (const { ds, imageId, file } of parsed) {
    const studyUid = str(ds, 'x0020000d') || 'unknown-study'
    const seriesUid = str(ds, 'x0020000e') || `unknown-series-${studyUid}`
    const pKey = [txt(ds, 'x00100020'), txt(ds, 'x00100010'), str(ds, 'x00100030')].join('|')

    let p = patients.get(pKey)
    if (!p) {
      p = { key: pKey, name: txt(ds, 'x00100010'), id: txt(ds, 'x00100020'), birthDate: str(ds, 'x00100030'), sex: str(ds, 'x00100040'), studies: [] }
      patients.set(pKey, p)
    }
    let st = studies.get(studyUid)
    if (!st) {
      st = { studyUid, date: str(ds, 'x00080020'), time: str(ds, 'x00080030'), description: txt(ds, 'x00081030'), accession: txt(ds, 'x00080050'), modalities: [], series: [] }
      studies.set(studyUid, st)
      p.studies.push(st)
    }
    let se = series.get(seriesUid)
    if (!se) {
      se = {
        seriesUid, studyUid, modality: str(ds, 'x00080060'), number: int(ds, 'x00200011'), description: txt(ds, 'x0008103e'),
        frameOfReference: str(ds, 'x00200052') || null, rows: ds.uint16('x00280010') ?? null, cols: ds.uint16('x00280011') ?? null,
        instances: [], imageIds: [],
      }
      series.set(seriesUid, se)
      st.series.push(se)
      if (se.modality && !st.modalities.includes(se.modality)) st.modalities.push(se.modality)
    }
    const pos = nums(ds, 'x00200032')
    const inst: Instance = {
      imageId,
      sopUid: str(ds, 'x00080018'),
      instanceNumber: int(ds, 'x00200013'),
      position: pos && pos.length === 3 ? [pos[0], pos[1], pos[2]] : null,
      orientation: nums(ds, 'x00200037'),
      frames: int(ds, 'x00280008') ?? 1,
      transferSyntax: str(ds, 'x00020010'),
      fileName: file.name,
    }
    if (!se.instances.some((i) => i.sopUid && i.sopUid === inst.sopUid)) se.instances.push(inst)
  }

  for (const se of series.values()) {
    sortInstances(se.instances)
    se.imageIds = se.instances.flatMap((i) => (i.frames > 1 ? Array.from({ length: i.frames }, (_, f) => `${i.imageId}?frame=${f}`) : [i.imageId]))
  }
  for (const st of studies.values()) st.series.sort((a, b) => (a.number ?? 1e9) - (b.number ?? 1e9))
  for (const p of patients.values()) p.studies.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))

  return { patients: [...patients.values()], skipped }
}

/** Spatial order along the slice normal when geometry is consistent, else instance number, else file name. */
export function sortInstances(list: Instance[]) {
  const o = list[0]?.orientation
  const spatial = o?.length === 6 && list.every((i) => i.position && i.orientation?.join() === o.join())
  if (spatial) {
    const n = [o[1] * o[5] - o[2] * o[4], o[2] * o[3] - o[0] * o[5], o[0] * o[4] - o[1] * o[3]]
    const d = (i: Instance) => i.position![0] * n[0] + i.position![1] * n[1] + i.position![2] * n[2]
    // head-first: highest z (superior) first, like most viewers show axial stacks
    list.sort((a, b) => d(b) - d(a))
    return
  }
  list.sort((a, b) => (a.instanceNumber ?? 1e9) - (b.instanceNumber ?? 1e9) || a.fileName.localeCompare(b.fileName))
}
