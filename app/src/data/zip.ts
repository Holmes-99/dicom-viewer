import { BlobReader, BlobWriter, ZipReader, type FileEntry } from '@zip.js/zip.js'

// ZIP archives (plain and AES / ZipCrypto password-protected) are unpacked in memory, then indexed like loose files.

export const isZip = (f: File) => /\.zip$/i.test(f.name) || f.type === 'application/zip' || f.type === 'application/x-zip-compressed'

export class ZipPasswordError extends Error {}

/** Asks for a password; null means the user cancelled. `retry` is true after a wrong password. */
export type AskPassword = (zipName: string, retry: boolean) => Promise<string | null>

const MAX_ENTRIES = 50_000

export async function unzip(zip: File, askPassword?: AskPassword): Promise<File[]> {
  const reader = new ZipReader(new BlobReader(zip))
  try {
    const entries = (await reader.getEntries()).filter((e): e is FileEntry => !e.directory)
    if (entries.length > MAX_ENTRIES) throw new Error(`${zip.name} has more than ${MAX_ENTRIES} files`)
    let password: string | undefined
    const out: File[] = []
    for (const e of entries) {
      // skip OS clutter that is never DICOM
      if (/(^|\/)(__MACOSX\/|\.DS_Store$|Thumbs\.db$)/i.test(e.filename)) continue
      for (let attempt = 0; ; attempt++) {
        if (e.encrypted && password === undefined) {
          const p = await askPassword?.(zip.name, attempt > 0)
          if (p == null) throw new ZipPasswordError(`${zip.name} needs a password`)
          password = p
        }
        try {
          const blob = await e.getData(new BlobWriter(), e.encrypted ? { password } : undefined)
          out.push(new File([blob], e.filename.split('/').pop() || e.filename))
          break
        } catch (err) {
          if (e.encrypted && /password/i.test(String(err))) { password = undefined; continue }
          throw err
        }
      }
    }
    return out
  } finally {
    await reader.close()
  }
}
