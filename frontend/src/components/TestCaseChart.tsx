import { useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useTheme } from '../theme'
import { verdictTone } from '../status'
import StatusChip from './StatusChip'
import { chartTokens } from '../chartTokens'

export type CaseMetric = 'cpu_time_ms' | 'wall_time_ms' | 'peak_memory_bytes'

// The backend returns no per-case wall time; fall back to CPU time when
// that metric is selected, since the units are the same.
const ACTIVE_METRIC: Record<CaseMetric, 'cpu_time_ms' | 'peak_memory_bytes'> = {
  cpu_time_ms: 'cpu_time_ms',
  wall_time_ms: 'cpu_time_ms',
  peak_memory_bytes: 'peak_memory_bytes',
}

export interface TestCaseDatum {
  name: string
  verdict: string
  value: number
}

interface TestCaseChartProps {
  cases: { verdict: string; cpu_time_ms: number; peak_memory_bytes: number }[]
  metric: CaseMetric
  metricLabel: string
  formatValue: (value: number) => string
}

interface CaseTooltipProps {
  active?: boolean
  payload?: ReadonlyArray<{ payload: TestCaseDatum }>
  formatValue: (value: number) => string
}

function CaseTooltip({ active, payload, formatValue }: CaseTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  const d = payload[0].payload
  return (
    <div className="rounded border border-line bg-surface px-3 py-2">
      <div className="text-xs font-medium text-ink">{d.name}</div>
      <div className="mt-1 flex items-center gap-2">
        <StatusChip tone={verdictTone(d.verdict)}>{d.verdict}</StatusChip>
        <span className="font-mono text-xs text-ink-muted tabular-nums">{formatValue(d.value)}</span>
      </div>
    </div>
  )
}

export default function TestCaseChart({ cases, metric, metricLabel, formatValue }: TestCaseChartProps) {
  const { theme } = useTheme()
  const tokens = chartTokens(theme)

  const [reduceMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  const key = ACTIVE_METRIC[metric]
  const showNote = metric === 'wall_time_ms'
  const label = metric === 'wall_time_ms' ? 'CPU time' : metricLabel
  const data: TestCaseDatum[] = cases.map((c, i) => ({
    name: `Test case ${i + 1}`,
    verdict: c.verdict,
    value: c[key],
  }))

  return (
    <div className="flex flex-col gap-3" aria-label={`${label} per test case`}>
      <div className="h-[200px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="30%">
            <CartesianGrid vertical={false} stroke={tokens.line} />
            <XAxis
              dataKey="name"
              interval={0}
              tickLine={false}
              axisLine={{ stroke: tokens.line }}
              tick={{ fill: tokens.ink, fontSize: 12 }}
              tickMargin={8}
            />
            <YAxis
              width={72}
              tickLine={false}
              axisLine={{ stroke: tokens.line }}
              tick={{ fill: tokens.inkMuted, fontSize: 11 }}
              tickFormatter={(value: number) => formatValue(value)}
            />
            <Tooltip
              cursor={{ fill: tokens.line, opacity: 0.35 }}
              content={<CaseTooltip formatValue={formatValue} />}
            />
            <Bar
              dataKey="value"
              fill={tokens.accent}
              radius={0}
              maxBarSize={48}
              isAnimationActive={!reduceMotion}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="grid gap-px border border-line bg-line" style={{ gridTemplateColumns: `repeat(${data.length || 1}, minmax(0, 1fr))` }}>
        {data.map((d) => (
          <div
            key={d.name}
            className="flex min-w-0 flex-col items-center gap-1.5 bg-surface px-2 py-2"
          >
            <span className="max-w-full truncate text-[11px] text-ink-muted">{d.name}</span>
            <StatusChip tone={verdictTone(d.verdict)}>{d.verdict}</StatusChip>
          </div>
        ))}
      </div>
      {showNote && (
        <p className="text-[11px] text-ink-muted">
          Per-case wall time is unavailable from the backend — showing CPU time.
        </p>
      )}
    </div>
  )
}