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
import { tierTone } from '../status'
import StatusChip from './StatusChip'
import { chartTokens } from '../chartTokens'

export interface StrategyDatum {
  strategy: string
  tier: string
  value: number
  allocated_mb?: number
  used_mb?: number
  allocated_str?: string
  used_str?: string
  is_uncapped?: boolean
}

interface StrategyBarChartProps {
  data: StrategyDatum[]
  metric?: string
  metricLabel: string
  formatValue: (value: number) => string
  tierLabelFn: (tier: string) => string
}

interface ChartTooltipProps {
  active?: boolean
  payload?: ReadonlyArray<{ payload: StrategyDatum }>
  formatValue: (value: number) => string
  tierLabelFn: (tier: string) => string
  isMemory?: boolean
}

function ChartTooltip({ active, payload, formatValue, tierLabelFn, isMemory }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  const d = payload[0].payload
  return (
    <div className="rounded border border-line bg-surface px-3 py-2">
      <div className="capitalize text-xs font-medium text-ink">{d.strategy}</div>
      <div className="mt-1 flex items-center gap-2">
        <StatusChip tone={tierTone(d.tier)} mono={false}>
          {tierLabelFn(d.tier)}
        </StatusChip>
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

export default function StrategyBarChart({
  data,
  metric,
  metricLabel,
  formatValue,
  tierLabelFn,
}: StrategyBarChartProps) {
  const { theme } = useTheme()
  const tokens = chartTokens(theme)
  const isMemory = metric === 'memory'

  const [reduceMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  return (
    <div className="flex flex-col gap-3" aria-label={`${metricLabel} across strategies`}>
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
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke={tokens.line} />
            <XAxis
              dataKey="strategy"
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
              content={
                <ChartTooltip
                  formatValue={formatValue}
                  tierLabelFn={tierLabelFn}
                  isMemory={isMemory}
                />
              }
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
                maxBarSize={64}
                isAnimationActive={!reduceMotion}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-4 gap-px border border-line bg-line">
        {data.map((d) => (
          <div
            key={d.strategy}
            className="flex min-w-0 flex-col items-center gap-1.5 bg-surface px-2 py-2"
          >
            <span className="max-w-full truncate text-[11px] capitalize text-ink-muted">
              {d.strategy}
            </span>
            <StatusChip tone={tierTone(d.tier)} mono={false}>
              {tierLabelFn(d.tier)}
            </StatusChip>
          </div>
        ))}
      </div>
    </div>
  )
}