import type { DataSet } from 'dicom-parser'

// DICOM Specific Character Set (0008,0005) → a TextDecoder label. dicom-parser reads every byte as one character,
// which turns UTF-8 and other encodings into garbage ("Ã…ngstrÃ¶m"). Text VRs go through this instead.
const LABELS: Record<string, string> = {
  '': 'windows-1252', 'ISO_IR 6': 'windows-1252', 'ISO 2022 IR 6': 'windows-1252',
  'ISO_IR 100': 'windows-1252', 'ISO 2022 IR 100': 'windows-1252',
  'ISO_IR 101': 'iso-8859-2', 'ISO 2022 IR 101': 'iso-8859-2',
  'ISO_IR 109': 'iso-8859-3', 'ISO 2022 IR 109': 'iso-8859-3',
  'ISO_IR 110': 'iso-8859-4', 'ISO 2022 IR 110': 'iso-8859-4',
  'ISO_IR 144': 'iso-8859-5', 'ISO 2022 IR 144': 'iso-8859-5',
  'ISO_IR 127': 'iso-8859-6', 'ISO 2022 IR 127': 'iso-8859-6',
  'ISO_IR 126': 'iso-8859-7', 'ISO 2022 IR 126': 'iso-8859-7',
  'ISO_IR 138': 'iso-8859-8', 'ISO 2022 IR 138': 'iso-8859-8',
  'ISO_IR 148': 'windows-1254', 'ISO 2022 IR 148': 'windows-1254',
  'ISO_IR 166': 'windows-874', 'ISO 2022 IR 166': 'windows-874',
  'ISO_IR 13': 'shift_jis', 'ISO 2022 IR 13': 'shift_jis',
  'ISO 2022 IR 87': 'iso-2022-jp', 'ISO 2022 IR 159': 'iso-2022-jp',
  'ISO 2022 IR 149': 'euc-kr', 'ISO 2022 IR 58': 'gb18030',
  'ISO_IR 192': 'utf-8', 'GB18030': 'gb18030', 'GBK': 'gbk',
}

/** Text VRs whose bytes follow the character set (the others are plain ASCII by definition). */
export const CHARSET_VRS = new Set(['PN', 'LO', 'SH', 'ST', 'LT', 'UT', 'UC'])

const decoders = new Map<string, TextDecoder>()
function decoderFor(ds: DataSet) {
  const terms = (ds.string('x00080005') ?? '').split('\\').map((t) => t.trim())
  // multi-valued (code extensions): the first extension that needs a real decoder decides
  const pick = terms.find((t) => t && LABELS[t] && LABELS[t] !== 'windows-1252') ?? terms[0] ?? ''
  const label = LABELS[pick] ?? 'windows-1252'
  let d = decoders.get(label)
  if (!d) {
    try { d = new TextDecoder(label) } catch { d = new TextDecoder('windows-1252') }
    decoders.set(label, d)
  }
  return d
}

/** The value of a text element decoded with the file's character set, trailing padding removed. */
export function text(ds: DataSet, tag: string): string {
  const el = ds.elements[tag]
  if (!el || !el.length) return ''
  const bytes = new Uint8Array(ds.byteArray.buffer, ds.byteArray.byteOffset + el.dataOffset, el.length)
  return decoderFor(ds).decode(bytes).replace(/[\0 ]+$/, '').replace(/^ +/, '')
}
