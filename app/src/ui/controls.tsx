import { forwardRef, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { Check, LoaderCircle } from 'lucide-react'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

const variants = {
  primary: 'bg-accent-strong text-on-accent hover:brightness-110 active:brightness-95',
  secondary: 'bg-surface-raised text-fg border border-border hover:bg-surface-hover',
  ghost: 'bg-transparent text-fg hover:bg-surface-hover',
  danger: 'bg-transparent text-danger border border-danger/60 hover:bg-danger/10',
}
const sizes = { sm: 'h-6 px-2 text-xs', md: 'h-7 px-3 text-sm', lg: 'h-8 px-4 text-sm' }

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, disabled, children, className, ...rest }, ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-semibold transition-[filter,background-color] duration-[var(--motion-fast)]',
        'disabled:opacity-45 disabled:pointer-events-none',
        variants[variant], sizes[size], className,
      )}
      {...rest}
    >
      {loading && <LoaderCircle size={14} className="animate-spin" aria-hidden />}
      {children}
    </button>
  )
})

const fieldBase =
  'h-7 w-full rounded-sm border border-border-input bg-bg px-2 text-sm text-fg placeholder:text-disabled ' +
  'focus:outline-2 focus:outline-focus focus:outline-offset-0 disabled:opacity-45 read-only:bg-surface ' +
  'aria-[invalid=true]:border-danger'

export function Field({ label, error, hint, children, id }: { label: string; error?: string; hint?: string; children: (id: string, describedBy?: string) => ReactNode; id?: string }) {
  const auto = useId()
  const fid = id ?? auto
  const desc = error || hint ? `${fid}-desc` : undefined
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={fid} className="text-xs text-muted">{label}</label>
      {children(fid, desc)}
      {(error || hint) && (
        <p id={desc} className={cx('text-xs', error ? 'text-danger' : 'text-muted')}>{error ?? hint}</p>
      )}
    </div>
  )
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(fieldBase, className)} {...rest} />
})

export function NumberInput({ value, onChange, step = 1, min, max, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & { value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number }) {
  const clamp = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v))
  return (
    <input
      type="text"
      inputMode="numeric"
      className={cx(fieldBase, 'font-mono tabular-nums text-right')}
      value={value}
      onChange={(e) => { const n = Number(e.target.value); if (!Number.isNaN(n)) onChange(clamp(n)) }}
      onKeyDown={(e) => {
        const m = e.shiftKey ? 10 : 1
        if (e.key === 'ArrowUp') { e.preventDefault(); onChange(clamp(value + step * m)) }
        if (e.key === 'ArrowDown') { e.preventDefault(); onChange(clamp(value - step * m)) }
      }}
      {...rest}
    />
  )
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx(fieldBase, 'pr-6', className)} {...rest}>{children}</select>
}

export function Checkbox({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={cx('inline-flex items-center gap-2 text-sm', disabled && 'opacity-45')}>
      <span className="relative inline-flex size-4">
        <input
          type="checkbox"
          className="peer size-4 appearance-none rounded-sm border border-border-input bg-bg checked:border-accent-strong checked:bg-accent-strong"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <Check size={12} strokeWidth={3} className="pointer-events-none absolute left-0.5 top-0.5 hidden text-on-accent peer-checked:block" aria-hidden />
      </span>
      {label}
    </label>
  )
}

export function Radio({ name, options, value, onChange }: { name: string; options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div role="radiogroup" className="flex flex-col gap-1.5">
      {options.map((o) => (
        <label key={o.value} className="inline-flex items-center gap-2 text-sm">
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            className="size-4 appearance-none rounded-full border border-border-input bg-bg checked:border-[5px] checked:border-accent-strong"
          />
          {o.label}
        </label>
      ))}
    </div>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-sm border border-border bg-bg px-1 font-mono text-2xs text-muted">{children}</kbd>
}
