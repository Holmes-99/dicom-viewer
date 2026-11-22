// DICOM value formatting. Dates/times are shown as written: DICOM has no time zone.
export const fmtName = (pn: string) => pn.split('=')[0].split('^').filter(Boolean).join(' ').trim()
export const fmtDate = (da: string) => (/^\d{8}$/.test(da) ? `${da.slice(0, 4)}-${da.slice(4, 6)}-${da.slice(6, 8)}` : da)
export const fmtTime = (tm: string) => (/^\d{4}/.test(tm) ? `${tm.slice(0, 2)}:${tm.slice(2, 4)}` : tm)
