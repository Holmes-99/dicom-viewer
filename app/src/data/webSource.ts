import dicomImageLoader from '@cornerstonejs/dicom-image-loader'
import type { DataSet } from 'dicom-parser'
import { buildSession, isDicomDir, parseHeader, type Parsed } from './index-files'
import type { DataSource, OpenProgress, Session } from './types'

// Browser implementation of the data layer. Files stay in memory; nothing leaves the machine.
const headers = new Map<string, DataSet>()

async function index(files: File[], onProgress?: (p: OpenProgress) => void): Promise<Session> {
  const parsed: Parsed[] = []
  const skipped: Session['skipped'] = []
  let done = 0
  const total = files.length
  const BATCH = 16
  for (let i = 0; i < files.length; i += BATCH) {
    await Promise.all(files.slice(i, i + BATCH).map(async (file) => {
      try {
        const ds = await parseHeader(file)
        if (isDicomDir(ds)) return // the folder scan already finds every file; DICOMDIR only speeds that up on discs
        if (!ds.elements.x7fe00010 && !ds.string('x00080018')) throw new Error('no image data')
        const imageId = dicomImageLoader.wadouri.fileManager.add(file)
        headers.set(imageId, ds)
        parsed.push({ file, imageId, ds })
      } catch {
        skipped.push({ fileName: file.name, reason: 'Not a DICOM file, or the file is damaged' })
      } finally {
        done++
      }
    }))
    onProgress?.({ done, total })
  }
  return buildSession(parsed, skipped)
}

export const webSource: DataSource = {
  openFiles: (files, onProgress) => index(files, onProgress),

  async openDemo(onProgress) {
    const names: string[] = await (await fetch('/demo/index.json')).json()
    const files: File[] = []
    let done = 0
    await Promise.all(names.map(async (n, i) => {
      const blob = await (await fetch(`/demo/${n}`)).blob()
      files[i] = new File([blob], n, { type: 'application/dicom' })
      onProgress?.({ done: ++done, total: names.length * 2 })
    }))
    return index(files, (p) => onProgress?.({ done: names.length + p.done, total: names.length * 2 }))
  },

  getHeader: (imageId) => headers.get(imageId.split('?')[0]),

  closeAll() {
    dicomImageLoader.wadouri.fileManager.purge()
    dicomImageLoader.wadouri.dataSetCacheManager.purge()
    headers.clear()
  },
}

/** Collects files from a drop, walking dropped folders recursively. */
export async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const entries = [...dt.items].map((i) => i.webkitGetAsEntry?.()).filter(Boolean) as FileSystemEntry[]
  if (!entries.length) return [...dt.files]
  const out: File[] = []
  const walk = async (e: FileSystemEntry): Promise<void> => {
    if (e.isFile) {
      out.push(await new Promise<File>((res, rej) => (e as FileSystemFileEntry).file(res, rej)))
    } else if (e.isDirectory) {
      const reader = (e as FileSystemDirectoryEntry).createReader()
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej))
        if (!batch.length) break
        for (const c of batch) await walk(c)
      }
    }
  }
  for (const e of entries) await walk(e)
  return out
}
