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
import { verdictTone, formatBytes } from '../status'
import StatusChip from './StatusChip'
import { chartTokens } from '../chartTokens'

export type CaseMetric = 'cpu_time_ms' | 'wall_time_ms' | 'memory'

export interface TestCaseDatum {
  name: string
  verdict: string
  value: number
  allocated_mb?: number
  used_mb?: number
  allocated_str?: string
  used_str?: string
}

interface TestCaseChartProps {
  cases: { verdict: string; cpu_time_ms: number; peak_memory_bytes: number; allocated_memory_bytes?: number }[]
  metric: CaseMetric
  metricLabel: string
  formatValue: (value: number) => string
}

interface CaseTooltipProps {
  active?: boolean
  payload?: ReadonlyArray<{ payload: TestCaseDatum }>
  formatValue: (value: number) => string
  isMemory?: boolean
}

function CaseTooltip({ active, payload, formatValue, isMemory }: CaseTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  const d = payload[0].payload
  return (
    <div className="rounded border border-line bg-surface px-3 py-2">
      <div className="text-xs font-medium text-ink">{d.name}</div>
      <div className="mt-1 flex items-center gap-2">
        <StatusChip tone={verdictTone(d.verdict)}>{d.verdict}</StatusChip>
      </div>
      {isMemory ? (
        <div className="mt-2 flex flex-col gap-1 font-mono text-xs">
          <div className="flex items-center justify-between gap-4">
            <span className="text-ink-muted">Allocated:</span>
            <span className="font-semibold text-ink">{d.allocated_str ?? `${d.allocated_mb} MB`}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-ink-muted">Used:</span>
            <span className="font-semibold text-ink">{d.used_str ?? `${d.used_mb} MB`}</span>
          </div>
        </div>
      ) : (
        <div className="mt-1">
          <span className="font-mono text-xs text-ink-muted tabular-nums">{formatValue(d.value)}</span>
        </div>
      )}
    </div>
  )
}

export default function TestCaseChart({ cases, metric, metricLabel, formatValue }: TestCaseChartProps) {
  const { theme } = useTheme()
  const tokens = chartTokens(theme)
  const isMemory = metric === 'memory'

  const [reduceMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  const showNote = metric === 'wall_time_ms'
  const label = metric === 'wall_time_ms' ? 'CPU time' : metricLabel
  const data: TestCaseDatum[] = cases.map((c, i) => {
    const allocatedBytes = c.allocated_memory_bytes && c.allocated_memory_bytes > 0
      ? c.allocated_memory_bytes
      : 256 * 1024 * 1024
    const usedBytes = c.peak_memory_bytes
    return {
      name: `Test case ${i + 1}`,
      verdict: c.verdict,
      value: isMemory ? usedBytes : (c.cpu_time_ms ?? 0),
      allocated_mb: +(allocatedBytes / (1024 * 1024)).toFixed(1),
      used_mb: +(usedBytes / (1024 * 1024)).toFixed(1),
      allocated_str: formatBytes(allocatedBytes),
      used_str: formatBytes(usedBytes),
    }
  })

  return (
    <div className="flex flex-col gap-3" aria-label={`${label} per test case`}>
      {isMemory && (
        <div className="flex items-center justify-end gap-5 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm border border-line bg-surface" />
            <span className="text-ink-muted">Memory Allocated</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-accent" />
            <span className="font-medium text-ink">Memory Used</span>
          </div>
        </div>
      )}
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
              tickFormatter={(value: number) => (isMemory ? `${value} MB` : formatValue(value))}
            />
            <Tooltip
              cursor={{ fill: tokens.line, opacity: 0.35 }}
              content={<CaseTooltip formatValue={formatValue} isMemory={isMemory} />}
            />
            {isMemory ? (
              <>
                <Bar
                  dataKey="allocated_mb"
                  name="Allocated"
                  fill={tokens.line}
                  stroke={tokens.inkMuted}
                  radius={0}
                  maxBarSize={36}
                  isAnimationActive={!reduceMotion}
                />
                <Bar
                  dataKey="used_mb"
                  name="Used"
                  fill={tokens.accent}
                  radius={0}
                  maxBarSize={36}
                  isAnimationActive={!reduceMotion}
                />
              </>
            ) : (
              <Bar
                dataKey="value"
                fill={tokens.accent}
                radius={0}
                maxBarSize={48}
                isAnimationActive={!reduceMotion}
              />
            )}
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