import type { ReactNode } from 'react'
import { ContextMenu as CM, Dialog as D, DropdownMenu as DM, Tooltip as T } from 'radix-ui'
import { Check, ChevronRight, CircleCheck, CircleX, TriangleAlert, X } from 'lucide-react'
import { Button, Kbd, cx } from './controls'

/* ---------- Tooltip ---------- */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return <T.Provider delayDuration={500} skipDelayDuration={300}>{children}</T.Provider>
}
export function Tip({ label, shortcut, children, side = 'bottom' }: { label: string; shortcut?: string; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content side={side} sideOffset={6} className="z-50 flex items-center gap-2 rounded-md bg-surface-raised px-2 py-1 text-xs text-fg shadow-pop">
          {label}{shortcut && <Kbd>{shortcut}</Kbd>}
        </T.Content>
      </T.Portal>
    </T.Root>
  )
}

/* ---------- Menus (dropdown + context share item styles) ---------- */
const menuContent = 'z-50 min-w-[200px] rounded-md bg-surface-raised p-1 text-sm text-fg shadow-pop'
const menuItem =
  'relative flex h-7 cursor-default select-none items-center gap-2 rounded-sm pl-7 pr-2 outline-none ' +
  'data-[highlighted]:bg-surface-hover data-[disabled]:text-disabled'

export type MenuEntry =
  | { type?: 'item'; label: string; shortcut?: string; disabled?: boolean; icon?: ReactNode; onSelect?: () => void }
  | { type: 'check'; label: string; checked: boolean; shortcut?: string; onChange?: (v: boolean) => void }
  | { type: 'separator' }
  | { type: 'label'; label: string }
  | { type: 'sub'; label: string; items: MenuEntry[] }

type Kit = typeof DM | typeof CM

function renderEntries(K: Kit, entries: MenuEntry[]): ReactNode {
  return entries.map((e, i) => {
    if (e.type === 'separator') return <K.Separator key={i} className="my-1 h-px bg-border" />
    if (e.type === 'label') return <K.Label key={i} className="px-7 py-1 text-2xs uppercase tracking-wide text-muted">{e.label}</K.Label>
    if (e.type === 'check')
      return (
        <K.CheckboxItem key={i} className={menuItem} checked={e.checked} onCheckedChange={(v) => e.onChange?.(v === true)}>
          <K.ItemIndicator className="absolute left-2"><Check size={14} /></K.ItemIndicator>
          <span className="flex-1">{e.label}</span>
          {e.shortcut && <span className="font-mono text-2xs text-muted">{e.shortcut}</span>}
        </K.CheckboxItem>
      )
    if (e.type === 'sub')
      return (
        <K.Sub key={i}>
          <K.SubTrigger className={menuItem}>
            <span className="flex-1">{e.label}</span><ChevronRight size={14} className="text-muted" />
          </K.SubTrigger>
          <K.Portal>
            <K.SubContent className={menuContent} sideOffset={2} alignOffset={-4}>{renderEntries(K, e.items)}</K.SubContent>
          </K.Portal>
        </K.Sub>
      )
    return (
      <K.Item key={i} className={menuItem} disabled={e.disabled} onSelect={e.onSelect}>
        {e.icon && <span className="absolute left-2 text-muted">{e.icon}</span>}
        <span className="flex-1">{e.label}</span>
        {e.shortcut && <span className="font-mono text-2xs text-muted">{e.shortcut}</span>}
      </K.Item>
    )
  })
}

export function Menu({ trigger, items, align = 'start' }: { trigger: ReactNode; items: MenuEntry[]; align?: 'start' | 'end' }) {
  return (
    <DM.Root>
      <DM.Trigger asChild>{trigger}</DM.Trigger>
      <DM.Portal>
        <DM.Content align={align} sideOffset={4} className={menuContent}>{renderEntries(DM, items)}</DM.Content>
      </DM.Portal>
    </DM.Root>
  )
}

export function ContextMenu({ children, items }: { children: ReactNode; items: MenuEntry[] }) {
  return (
    <CM.Root>
      <CM.Trigger asChild>{children}</CM.Trigger>
      <CM.Portal>
        <CM.Content className={menuContent}>{renderEntries(CM, items)}</CM.Content>
      </CM.Portal>
    </CM.Root>
  )
}

/* ---------- Dialog ---------- */
export function Dialog({
  open, onOpenChange, title, children, footer, size = 'md', trigger,
}: { open?: boolean; onOpenChange?: (v: boolean) => void; title: string; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg'; trigger?: ReactNode }) {
  const w = { sm: 'w-[360px]', md: 'w-[480px]', lg: 'w-[720px]' }[size]
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <D.Trigger asChild>{trigger}</D.Trigger>}
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <D.Content className={cx('fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-surface-raised shadow-dialog', w)}>
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <D.Title className="text-lg">{title}</D.Title>
            <D.Close asChild>
              <button aria-label="Close" className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface-hover hover:text-fg"><X size={16} /></button>
            </D.Close>
          </div>
          <D.Description className="sr-only">{title}</D.Description>
          <div className="flex flex-col gap-3 px-4 py-3">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-border px-4 py-2.5">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}
export const DialogClose = D.Close

/* ---------- Progress + Toast ---------- */
export function Progress({ value, label, onCancel }: { value: number | null; label: string; onCancel?: () => void }) {
  return (
    <div className="flex flex-col gap-1.5" role="status">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>{label}</span>
        {onCancel && <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>}
      </div>
      <div className="h-1 overflow-hidden rounded-sm bg-bg" role="progressbar" aria-valuenow={value ?? undefined} aria-valuemin={0} aria-valuemax={100}>
        <div
          className={cx('h-full bg-accent', value === null && 'w-1/3 animate-[indeterminate_1.2s_ease-in-out_infinite]')}
          style={value === null ? undefined : { width: `${value}%` }}
        />
      </div>
    </div>
  )
}

export function Toast({ tone, title, body, action, onClose }: { tone: 'success' | 'warning' | 'danger'; title: string; body?: string; action?: ReactNode; onClose?: () => void }) {
  const Icon = { success: CircleCheck, warning: TriangleAlert, danger: CircleX }[tone]
  const color = { success: 'text-success', warning: 'text-warning', danger: 'text-danger' }[tone]
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className="flex w-[360px] gap-3 rounded-md bg-surface-raised p-3 shadow-pop">
      <Icon size={18} className={cx('mt-0.5 shrink-0', color)} aria-hidden />
      <div className="flex flex-1 flex-col gap-1">
        <p className="text-sm font-semibold">{title}</p>
        {body && <p className="text-xs text-muted">{body}</p>}
        {action && <div className="mt-1">{action}</div>}
      </div>
      {onClose && (
        <button aria-label="Dismiss" onClick={onClose} className="grid size-6 place-items-center rounded-sm text-muted hover:bg-surface-hover"><X size={14} /></button>
      )}
    </div>
  )
}
