import type { ReactNode } from 'react'

/** Flat instrument panel: surface background + hairline border, no shadow. */
export function Panel({ className = '', children }: { className?: string; children: ReactNode }) {
  return <section className={`border border-line bg-surface ${className}`}>{children}</section>
}

interface MetricStatProps {
  label: string
  value: ReactNode
  valueClassName?: string
}

/**
 * A stat cell: quiet sans label with the real value as the hero — large mono,
 * tabular so numbers align. Cells are laid out by the caller inside a hairline
 * grid (bg-line gap-px) rather than individual rounded/shadowed cards.
 */
export function MetricStat({ label, value, valueClassName = '' }: MetricStatProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 bg-surface px-4 py-3">
      <span className="truncate text-xs text-ink-muted">{label}</span>
      <span
        className={`truncate font-mono text-xl leading-tight text-ink tabular-nums ${valueClassName}`}
      >
        {value}
      </span>
    </div>
  )
}
