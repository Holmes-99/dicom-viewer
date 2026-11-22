// The desktop shell's bridge (electron/preload.cjs). Undefined in a plain browser, so every use is optional.
export type OpenedFile = { token: string; name: string; size: number }

type Bridge = {
  desktop: true
  platform: string
  version(): Promise<string>
  onOpenRequest(cb: (files: OpenedFile[]) => void): void
}

export const desktop: Bridge | undefined = (window as unknown as { viewer?: Bridge }).viewer

/** Turns files the shell handed over into File objects, so the same data layer opens them. */
export async function fetchOpened(list: OpenedFile[], onProgress?: (done: number, total: number) => void): Promise<File[]> {
  const out: File[] = []
  let done = 0
  const BATCH = 16
  for (let i = 0; i < list.length; i += BATCH) {
    await Promise.all(list.slice(i, i + BATCH).map(async (f, j) => {
      const res = await fetch(`/@file/${f.token}`)
      if (res.ok) out[i + j] = new File([await res.blob()], f.name)
      onProgress?.(++done, list.length)
    }))
  }
  return out.filter(Boolean)
}
