import { useMemo, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button, cx } from './controls'

export type Column<T> = { key: keyof T & string; label: string; width?: number; mono?: boolean; render?: (row: T) => ReactNode }

export function DataTable<T extends { id: string | number }>({
  columns, rows, state = 'ready', emptyText, emptyAction, filter, onRetry, label,
}: {
  columns: Column<T>[]; rows: T[]; state?: 'ready' | 'loading' | 'error'; emptyText: string; emptyAction?: ReactNode
  filter?: string; onRetry?: () => void; label: string
}) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null)
  const [sel, setSel] = useState<Set<T['id']>>(new Set())
  const [anchor, setAnchor] = useState<number | null>(null)

  const view = useMemo(() => {
    let r = rows
    if (filter) {
      const q = filter.toLowerCase()
      r = r.filter((row) => columns.some((c) => String(row[c.key] ?? '').toLowerCase().includes(q)))
    }
    if (sort) r = [...r].sort((a, b) => String(a[sort.key as keyof T]).localeCompare(String(b[sort.key as keyof T]), undefined, { numeric: true }) * sort.dir)
    return r
  }, [rows, filter, sort, columns])

  const click = (i: number, e: React.MouseEvent) => {
    const id = view[i].id
    const next = new Set(e.ctrlKey ? sel : [])
    if (e.shiftKey && anchor !== null) {
      const [a, b] = [Math.min(anchor, i), Math.max(anchor, i)]
      for (let k = a; k <= b; k++) next.add(view[k].id)
    } else if (e.ctrlKey && sel.has(id)) next.delete(id)
    else next.add(id)
    setSel(next)
    if (!e.shiftKey) setAnchor(i)
  }

  return (
    <div className="overflow-hidden rounded-md border border-border bg-bg">
      <table role="grid" aria-label={label} aria-multiselectable className="w-full table-fixed border-collapse text-sm">
        <thead className="sticky top-0 bg-surface">
          <tr>
            {columns.map((c) => {
              const dir = sort?.key === c.key ? sort.dir : 0
              return (
                <th key={c.key} style={{ width: c.width }} aria-sort={dir === 1 ? 'ascending' : dir === -1 ? 'descending' : 'none'} className="h-7 border-b border-border p-0 text-left text-xs font-semibold text-muted">
                  <button
                    className="flex h-full w-full items-center gap-1 px-2 hover:text-fg"
                    onClick={() => setSort(dir === 1 ? { key: c.key, dir: -1 } : dir === -1 ? null : { key: c.key, dir: 1 })}
                  >
                    {c.label}
                    {dir !== 0 && <ChevronDown size={12} className={cx(dir === -1 && 'rotate-180')} />}
                  </button>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {state === 'loading' && Array.from({ length: 4 }, (_, i) => (
            <tr key={i} className="h-6">
              {columns.map((c) => <td key={c.key} className="px-2"><div className="h-2.5 animate-pulse rounded-sm bg-surface-hover" style={{ width: `${40 + ((i * 17 + c.key.length * 11) % 50)}%` }} /></td>)}
            </tr>
          ))}
          {state === 'error' && (
            <tr><td colSpan={columns.length} className="px-3 py-6 text-center">
              <p role="alert" className="mb-2 text-sm text-danger">Couldn't reach the server. Check the node settings and try again.</p>
              {onRetry && <Button size="sm" onClick={onRetry}>Retry</Button>}
            </td></tr>
          )}
          {state === 'ready' && view.length === 0 && (
            <tr><td colSpan={columns.length} className="px-3 py-6 text-center text-sm text-muted">
              <p className="mb-2">{filter && rows.length ? `Nothing matches “${filter}”` : emptyText}</p>
              {!filter && emptyAction}
            </td></tr>
          )}
          {state === 'ready' && view.map((row, i) => (
            <tr
              key={row.id}
              aria-selected={sel.has(row.id)}
              onClick={(e) => click(i, e)}
              className={cx('h-6 cursor-default', sel.has(row.id) ? 'bg-accent-strong/35' : 'hover:bg-surface-hover')}
            >
              {columns.map((c) => (
                <td key={c.key} className={cx('truncate px-2', c.mono && 'font-mono text-xs tabular-nums')}>
                  {c.render ? c.render(row) : String(row[c.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
