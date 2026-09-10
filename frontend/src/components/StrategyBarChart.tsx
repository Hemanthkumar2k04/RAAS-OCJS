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

export interface StrategyDatum {
  strategy: string
  tier: string
  value: number
}

interface Tokens {
  accent: string
  ink: string
  inkMuted: string
  line: string
  surface: string
}

// Mirror of the design tokens in src/index.css (`:root` vs `.dark`).
// `--accent` is fixed across modes; the rest flip with the `.dark` class.
const LIGHT_TOKENS: Tokens = {
  accent: '#0ea5a5',
  ink: '#1a2323',
  inkMuted: '#5c6b6b',
  line: '#e4e8e8',
  surface: '#ffffff',
}

const DARK_TOKENS: Tokens = {
  accent: '#0ea5a5',
  ink: '#eaf0f0',
  inkMuted: '#8fa0a0',
  line: '#283333',
  surface: '#161d1d',
}

interface StrategyBarChartProps {
  data: StrategyDatum[]
  metricLabel: string
  formatValue: (value: number) => string
  tierLabelFn: (tier: string) => string
}

interface ChartTooltipProps {
  active?: boolean
  payload?: ReadonlyArray<{ payload: StrategyDatum }>
  formatValue: (value: number) => string
  tierLabelFn: (tier: string) => string
}

function ChartTooltip({ active, payload, formatValue, tierLabelFn }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  const d = payload[0].payload
  return (
    <div className="rounded border border-line bg-surface px-3 py-2">
      <div className="capitalize text-xs font-medium text-ink">{d.strategy}</div>
      <div className="mt-1 flex items-center gap-2">
        <StatusChip tone={tierTone(d.tier)} mono={false}>
          {tierLabelFn(d.tier)}
        </StatusChip>
        <span className="font-mono text-xs text-ink-muted tabular-nums">{formatValue(d.value)}</span>
      </div>
    </div>
  )
}

export default function StrategyBarChart({
  data,
  metricLabel,
  formatValue,
  tierLabelFn,
}: StrategyBarChartProps) {
  const { theme } = useTheme()
  const tokens = theme === 'dark' ? DARK_TOKENS : LIGHT_TOKENS

  const [reduceMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  return (
    <div className="flex flex-col gap-3" aria-label={`${metricLabel} across strategies`}>
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
              tickFormatter={(value: number) => formatValue(value)}
            />
            <Tooltip
              cursor={{ fill: tokens.line, opacity: 0.35 }}
              content={<ChartTooltip formatValue={formatValue} tierLabelFn={tierLabelFn} />}
            />
            <Bar
              dataKey="value"
              fill={tokens.accent}
              radius={0}
              maxBarSize={64}
              isAnimationActive={!reduceMotion}
            />
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