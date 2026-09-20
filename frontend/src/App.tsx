import { useEffect, useRef, useState } from 'react'
import ThemeProvider from './components/ThemeProvider'
import ThemeToggle from './components/ThemeToggle'
import CodeEditor from './components/CodeEditor'
import StatusChip from './components/StatusChip'
import StrategyBarChart from './components/StrategyBarChart'
import TestCaseChart from './components/TestCaseChart'
import { Panel, MetricStat } from './components/ui'
import { tierTone, verdictTone } from './status'
import { PROBLEMS, type CodeLanguage } from './problems'

const BACKEND_URL = 'http://localhost:3000'

const STRATEGIES = ['Baseline', 'Predictive', 'Reactive', 'Hybrid', 'Run all four strategies'] as const
type Strategy = (typeof STRATEGIES)[number]

const RUN_ALL = ['baseline', 'predictive', 'reactive', 'hybrid'] as const

const LANGS: CodeLanguage[] = ['C', 'C++', 'Java', 'Python']

function apiLanguage(lang: CodeLanguage): string {
  switch (lang) {
    case 'C++':
      return 'cpp'
    case 'C':
      return 'c'
    case 'Java':
      return 'java'
    case 'Python':
      return 'python'
  }
}

function monacoLanguage(lang: CodeLanguage): string {
  switch (lang) {
    case 'C++':
      return 'cpp'
    case 'C':
      return 'c'
    case 'Java':
      return 'java'
    case 'Python':
      return 'python'
  }
}

interface CaseResult {
  verdict: string
  cpu_time_ms: number
  peak_memory_bytes: number
  allocated_memory_bytes?: number
}

interface JudgeResult {
  submission_id: string
  approach: string
  verdict: string
  cpu_time_ms: number
  peak_memory_bytes: number
  allocated_memory_bytes?: number
  wall_time_ms: number
  tier_started: string
  tier_promoted: boolean
  promotion_time_ms: number
  cases: CaseResult[]
}

type ComparisonMetric = 'cpu_time_ms' | 'wall_time_ms' | 'memory'

const METRICS: ComparisonMetric[] = [
  'cpu_time_ms',
  'wall_time_ms',
  'memory',
]

const METRIC_LABELS: Record<ComparisonMetric, string> = {
  cpu_time_ms: 'CPU time',
  wall_time_ms: 'Wall time',
  memory: 'Memory',
}

function tierLabel(tier: string): string {
  return tier === 'low' ? 'Light' : 'Heavy'
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`
  return `${bytes} B`
}

function getAllocatedMemory(result: JudgeResult): number {
  if (result.allocated_memory_bytes !== undefined && result.allocated_memory_bytes > 0) {
    return result.allocated_memory_bytes
  }
  if (result.tier_started === 'low' && !result.tier_promoted) {
    return 256 * 1024 * 1024
  }
  return 0
}

function formatAllocatedMemory(result: JudgeResult): string {
  if (result.tier_promoted) {
    return '256 MB → Uncapped (Promoted)'
  }
  const bytes = getAllocatedMemory(result)
  if (bytes === 0 || result.tier_started === 'high') {
    return 'Uncapped (Host)'
  }
  return formatBytes(bytes)
}


type BackendStatus = 'checking' | 'online' | 'offline'

const STATUS_DOT: Record<BackendStatus, string> = {
  online: 'bg-success',
  offline: 'bg-danger',
  checking: 'bg-warning',
}

const STATUS_LABEL: Record<BackendStatus, string> = {
  online: 'Online',
  offline: 'Offline',
  checking: 'Checking',
}

function BackendIndicator({ status }: { status: BackendStatus }) {
  return (
    <div
      className="inline-flex items-center gap-2 border border-line bg-canvas px-3 py-1.5 text-sm"
      role="status"
      title={`Judge backend ${BACKEND_URL}`}
    >
      <span
        className={`h-2 w-2 ${STATUS_DOT[status]} ${status === 'checking' ? 'animate-pulse' : ''}`}
        aria-hidden="true"
      />
      <span className="font-medium text-ink-muted">Backend: {STATUS_LABEL[status]}</span>
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <JudgePage />
    </ThemeProvider>
  )
}

function JudgePage() {
  const [selectedProblemId, setSelectedProblemId] = useState<string>(PROBLEMS[0].id)
  const [language, setLanguage] = useState<CodeLanguage>('Python')
  const [strategy, setStrategy] = useState<Strategy>('Predictive')

  const currentProblem = PROBLEMS.find((p) => p.id === selectedProblemId) ?? PROBLEMS[0]
  const [source, setSource] = useState<string>(currentProblem.code.Python)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [singleResult, setSingleResult] = useState<JudgeResult | null>(null)
  const [allResults, setAllResults] = useState<JudgeResult[] | null>(null)
  const [metric, setMetric] = useState<ComparisonMetric>('cpu_time_ms')
  const [status, setStatus] = useState<BackendStatus>('checking')
  const [runSeq, setRunSeq] = useState(0)
  const subCounterRef = useRef(0)

  useEffect(() => {
    const check = async () => {
      try {
        await fetch(`${BACKEND_URL}/health`, {
          method: 'GET',
        })
        setStatus('online')
      } catch {
        setStatus('offline')
      }
    }
    check()
    const id = setInterval(check, 15000)
    return () => clearInterval(id)
  }, [])

  function handleSelectProblem(problemId: string) {
    const next = PROBLEMS.find((p) => p.id === problemId) ?? PROBLEMS[0]
    setSelectedProblemId(problemId)
    setSource(next.code[language])
    setSingleResult(null)
    setAllResults(null)
  }

  function handleLanguageChange(nextLang: CodeLanguage) {
    setLanguage(nextLang)
    setSource(currentProblem.code[nextLang])
    setSingleResult(null)
    setAllResults(null)
  }

  function handleResetCode() {
    setSource(currentProblem.code[language])
  }

  async function submitOne(approach: string): Promise<JudgeResult> {
    subCounterRef.current += 1
    const payload = {
      id: `sub-${subCounterRef.current}`,
      language: apiLanguage(language),
      source,
      test_cases: currentProblem.testCases,
      approach,
    }
    const res = await fetch(`${BACKEND_URL}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as JudgeResult
  }

  async function handleRun() {
    setError(null)
    setRunning(true)
    try {
      if (strategy === 'Run all four strategies') {
        const results: JudgeResult[] = []
        for (const s of RUN_ALL) {
          results.push(await submitOne(s))
        }
        setAllResults(results)
        setSingleResult(null)
      } else {
        const approach = strategy === 'Baseline' ? 'baseline' : strategy.toLowerCase()
        setSingleResult(await submitOne(approach))
        setAllResults(null)
      }
      setRunSeq((n) => n + 1)
    } catch {
      setError('Unable to connect to judge backend (http://localhost:3000)')
      setSingleResult(null)
      setAllResults(null)
    } finally {
      setRunning(false)
    }
  }

  const hasResult = singleResult !== null || allResults !== null
  const runDisabled = running || status === 'offline'
  const chartData = allResults
    ? allResults.map((r) => {
        const allocated = getAllocatedMemory(r)
        const used = r.peak_memory_bytes
        const isMem = metric === 'memory'
        const val = isMem ? used : (r[metric as 'cpu_time_ms' | 'wall_time_ms'] as number)
        const isUncapped = r.tier_started === 'high' || r.approach.toLowerCase() === 'baseline'
        const allocatedMb = isUncapped
          ? 0
          : (allocated > 0 ? +(allocated / (1024 * 1024)).toFixed(1) : 256)
        return {
          strategy: r.approach,
          tier: r.tier_started,
          value: val,
          allocated_mb: allocatedMb,
          used_mb: +(used / (1024 * 1024)).toFixed(1),
          allocated_str: formatAllocatedMemory(r),
          used_str: formatBytes(used),
          is_uncapped: isUncapped,
        }
      })
    : null

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="sticky top-0 z-10 border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-[1720px] items-center justify-between gap-4 px-6 py-3 lg:px-8">
          <div className="flex min-w-0 items-baseline gap-3">
            <h1 className="whitespace-nowrap text-[15px] font-semibold tracking-tight text-ink">
              RAAS-OJS
            </h1>
            <p className="hidden truncate text-xs text-ink-muted md:block">
              Resource-Aware Adaptive Scheduling for Online Judge Systems
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <BackendIndicator status={status} />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="bg-canvas">
        <div className="mx-auto w-full max-w-[1720px] px-6 py-6 lg:px-8">
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
            {/* ------------------------------------------------ left column */}
            <section className="flex flex-col gap-6">
              {/* Benchmark Switcher Panel */}
              <Panel className="flex flex-col p-4">
                <div className="flex items-center justify-between border-b border-line pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                      Benchmarks
                    </span>
                    <span className="rounded bg-ink/5 px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">
                      {PROBLEMS.length} Available
                    </span>
                  </div>
                  <span className="text-[11px] text-ink-muted">Select problem</span>
                </div>

                <div className="mt-3 flex flex-col gap-1.5">
                  {PROBLEMS.map((prob) => {
                    const isSelected = prob.id === currentProblem.id
                    return (
                      <button
                        key={prob.id}
                        type="button"
                        onClick={() => handleSelectProblem(prob.id)}
                        className={`flex items-center justify-between gap-3 rounded border px-3 py-2 text-left transition-all ${
                          isSelected
                            ? 'border-accent bg-accent/10 font-medium text-ink shadow-xs'
                            : 'border-transparent bg-canvas text-ink-muted hover:border-line hover:bg-surface hover:text-ink'
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded font-mono text-xs font-medium ${
                              isSelected ? 'bg-accent text-on-accent' : 'bg-line text-ink-muted'
                            }`}
                          >
                            {prob.number}
                          </span>
                          <span className="truncate text-xs font-medium">
                            {prob.title.replace(/^\d+\.\s*/, '')}
                          </span>
                        </div>
                        <StatusChip mono={false} tone={prob.tagTone} className="shrink-0 px-2 py-0.5 text-[10px]">
                          {prob.category}
                        </StatusChip>
                      </button>
                    )
                  })}
                </div>
              </Panel>

              {/* Problem Details Panel */}
              <Panel className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <StatusChip mono={false} tone={currentProblem.tagTone}>
                      {currentProblem.category}
                    </StatusChip>
                    <span className="rounded border border-line bg-canvas px-2 py-0.5 font-mono text-[11px] text-ink-muted">
                      {currentProblem.complexity}
                    </span>
                  </div>
                  <span className="text-xs font-medium text-accent">
                    {currentProblem.targetStrategy}
                  </span>
                </div>
                <h2 className="mt-4 text-lg font-semibold leading-tight text-ink">
                  {currentProblem.title}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                  {currentProblem.description}
                </p>
              </Panel>

              {/* Test Cases Panel */}
              <Panel className="flex flex-col gap-4 p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-medium text-ink-muted">
                    Test cases ({currentProblem.testCases.length})
                  </h3>
                  <span className="font-mono text-[11px] text-ink-muted">
                    stdin / stdout
                  </span>
                </div>
                <div className="flex flex-col gap-3">
                  {currentProblem.testCases.map((tc, i) => (
                    <div key={i} className="grid grid-cols-2 gap-px border border-line bg-line">
                      <div className="min-w-0 bg-canvas p-3">
                        <div className="text-[11px] text-ink-muted">Input</div>
                        <pre className="mt-1.5 max-h-28 overflow-x-auto overflow-y-auto whitespace-pre-wrap font-mono text-sm text-ink">
                          {tc.displayInput ??
                            (tc.input.length > 250
                              ? `${tc.input.slice(0, 200).trim()} ... [${tc.input.length.toLocaleString()} chars]`
                              : tc.input.trim() || '(empty)')}
                        </pre>
                      </div>
                      <div className="min-w-0 bg-canvas p-3">
                        <div className="text-[11px] text-ink-muted">Expected</div>
                        <pre className="mt-1.5 overflow-x-auto whitespace-pre-wrap font-mono text-sm text-ink">
                          {tc.expected.trim()}
                        </pre>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            </section>

            {/* ----------------------------------------------- right column */}
            <section className="flex flex-col gap-6">
              <Panel className="flex flex-col">
                <div className="flex flex-wrap items-end gap-x-6 gap-y-3 border-b border-line px-5 py-3.5">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs text-ink-muted">Language</span>
                    <select
                      className="h-9 rounded border border-line bg-canvas px-3 text-sm text-ink outline-none transition-colors hover:border-ink-muted focus:border-accent"
                      value={language}
                      onChange={(e) => handleLanguageChange(e.target.value as CodeLanguage)}
                    >
                      {LANGS.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs text-ink-muted">Strategy</span>
                    <select
                      className="h-9 rounded border border-line bg-canvas px-3 text-sm text-ink outline-none transition-colors hover:border-ink-muted focus:border-accent"
                      value={strategy}
                      onChange={(e) => {
                        setStrategy(e.target.value as Strategy)
                        setSingleResult(null)
                        setAllResults(null)
                      }}
                    >
                      {STRATEGIES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="ml-auto flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleResetCode}
                      title="Reset code to problem template"
                      className="inline-flex h-9 items-center justify-center rounded border border-line bg-canvas px-3 text-xs font-medium text-ink-muted transition-colors hover:border-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      Reset Code
                    </button>
                    <button
                      type="button"
                      onClick={handleRun}
                      disabled={runDisabled}
                      aria-busy={running}
                      className="inline-flex h-9 items-center justify-center rounded bg-accent px-4 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {running ? 'Running…' : 'Run Code'}
                    </button>
                  </div>
                </div>

                <div className="bg-canvas">
                  <div className="h-[360px]">
                    <CodeEditor language={monacoLanguage(language)} value={source} onChange={setSource} />
                  </div>
                </div>
              </Panel>

              {error && (
                <div
                  role="alert"
                  className="flex flex-col gap-1 border border-danger/40 bg-danger/10 px-4 py-3"
                >
                  <span className="text-sm font-semibold text-danger">{error}</span>
                  <p className="text-xs text-ink-muted">
                    Make sure the judge is running (
                    <code className="font-mono text-ink-muted">{BACKEND_URL}</code>) and the Docker
                    runtime images are built.
                  </p>
                </div>
              )}

              {hasResult && (
                <div key={runSeq} className="reveal flex flex-col gap-6">
                  {singleResult && (
                    <Panel className="p-5">
                      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                        <div>
                          <h3 className="text-xs font-medium text-ink-muted">Result</h3>
                          <div className="mt-2 flex items-center gap-3">
                            <StatusChip tone={verdictTone(singleResult.verdict)} className="px-2 py-1 text-xs">
                              {singleResult.verdict}
                            </StatusChip>
                            <span className="font-mono text-xs text-ink-muted">
                              {singleResult.submission_id}
                            </span>
                          </div>
                        </div>
                        <span className="font-mono text-xs text-ink-muted">
                          {singleResult.approach}
                        </span>
                      </div>

                      {/* Hero numbers */}
                      <div className="mt-5 grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-4">
                        <MetricStat label="CPU time" value={`${singleResult.cpu_time_ms} ms`} />
                        <MetricStat label="Wall time" value={`${singleResult.wall_time_ms} ms`} />
                        <MetricStat label="Memory used" value={formatBytes(singleResult.peak_memory_bytes)} />
                        <MetricStat label="Memory allocated" value={formatAllocatedMemory(singleResult)} />
                      </div>

                      {/* Per test case chart */}
                      {singleResult.cases.length > 0 && (
                        <div className="mt-5">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <h4 className="text-xs font-medium text-ink-muted">Per test case</h4>
                            <div className="inline-flex rounded border border-line bg-canvas p-0.5">
                              {METRICS.map((m) => (
                                <button
                                  key={m}
                                  type="button"
                                  onClick={() => setMetric(m)}
                                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                                    metric === m
                                      ? 'bg-accent text-on-accent'
                                      : 'text-ink-muted hover:text-ink'
                                  }`}
                                >
                                  {METRIC_LABELS[m]}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="mt-3">
                            <TestCaseChart
                              key={runSeq}
                              cases={singleResult.cases}
                              metric={metric}
                              metricLabel={METRIC_LABELS[metric]}
                              formatValue={(v) =>
                                metric === 'memory'
                                  ? formatBytes(v)
                                  : `${v} ms`
                              }
                            />
                          </div>
                        </div>
                      )}

                      {/* Scheduling spec */}
                      <div className="mt-5 flex flex-col divide-y divide-line border-t border-line">
                        <div className="flex items-center justify-between gap-4 py-2.5">
                          <span className="text-sm text-ink-muted">Starting tier</span>
                          <StatusChip tone={tierTone(singleResult.tier_started)} mono={false}>
                            {tierLabel(singleResult.tier_started)}
                          </StatusChip>
                        </div>
                        <div className="flex items-center justify-between gap-4 py-2.5">
                          <span className="text-sm text-ink-muted">Memory allocated</span>
                          <span className="font-mono text-sm text-ink">
                            {formatAllocatedMemory(singleResult)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4 py-2.5">
                          <span className="text-sm text-ink-muted">Memory used (peak)</span>
                          <span className="font-mono text-sm text-ink">
                            {formatBytes(singleResult.peak_memory_bytes)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4 py-2.5">
                          <span className="text-sm text-ink-muted">Tier promoted</span>
                          <span className="font-mono text-sm text-ink">
                            {singleResult.tier_promoted ? 'Yes' : 'No'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4 py-2.5">
                          <span className="text-sm text-ink-muted">Promotion time</span>
                          <span className="font-mono text-sm text-ink tabular-nums">
                            {singleResult.promotion_time_ms} ms
                          </span>
                        </div>
                      </div>

                      <h4 className="mt-5 text-xs font-medium text-ink-muted">
                        Cases ({singleResult.cases.length})
                      </h4>
                      <div className="mt-2 overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-line text-left">
                              <th className="py-2 pr-3 text-xs font-medium text-ink-muted">Case</th>
                              <th className="py-2 pr-3 text-xs font-medium text-ink-muted">Verdict</th>
                              {metric === 'memory' ? (
                                <>
                                  <th className="py-2 pr-3 text-right text-xs font-medium text-ink-muted">
                                    Memory Allocated
                                  </th>
                                  <th className="py-2 text-right text-xs font-medium text-ink-muted">
                                    Memory Used
                                  </th>
                                </>
                              ) : (
                                <th className="py-2 text-right text-xs font-medium text-ink-muted">
                                  CPU Time
                                </th>
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {singleResult.cases.map((c, i) => (
                              <tr key={i} className="border-b border-line last:border-0">
                                <td className="py-2.5 pr-3 text-sm text-ink-muted">Case {i + 1}</td>
                                <td className="py-2.5 pr-3">
                                  <StatusChip tone={verdictTone(c.verdict)}>{c.verdict}</StatusChip>
                                </td>
                                {metric === 'memory' ? (
                                  <>
                                    <td className="py-2.5 pr-3 text-right font-mono text-xs text-ink tabular-nums">
                                      {c.allocated_memory_bytes && c.allocated_memory_bytes > 0
                                        ? formatBytes(c.allocated_memory_bytes)
                                        : singleResult.tier_started === 'high'
                                        ? 'Uncapped'
                                        : '256 MB'}
                                    </td>
                                    <td className="py-2.5 text-right font-mono text-xs font-semibold text-ink tabular-nums">
                                      {formatBytes(c.peak_memory_bytes)}
                                    </td>
                                  </>
                                ) : (
                                  <td className="py-2.5 text-right font-mono text-xs text-ink tabular-nums">
                                    {c.cpu_time_ms} ms
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Panel>
                  )}

                  {allResults && (
                    <Panel className="p-5">
                      {chartData && (
                        <div className="mb-6">
                          <StrategyBarChart
                            key={runSeq}
                            data={chartData}
                            metric={metric}
                            metricLabel={METRIC_LABELS[metric]}
                            formatValue={(v) =>
                              metric === 'memory' ? formatBytes(v) : `${v} ms`
                            }
                            tierLabelFn={tierLabel}
                          />
                        </div>
                      )}

                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <h3 className="text-xs font-medium text-ink-muted">Strategy comparison</h3>
                        <div className="inline-flex rounded border border-line bg-canvas p-0.5">
                          {METRICS.map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setMetric(m)}
                              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                                metric === m
                                  ? 'bg-accent text-on-accent'
                                  : 'text-ink-muted hover:text-ink'
                              }`}
                            >
                              {METRIC_LABELS[m]}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="mt-4 overflow-x-auto">
                        <table className="w-full min-w-[620px] text-sm">
                          <thead>
                            <tr className="border-b border-line text-left">
                              <th className="py-2 pr-3 text-xs font-medium text-ink-muted">
                                Strategy
                              </th>
                              <th className="py-2 pr-3 text-xs font-medium text-ink-muted">
                                Verdict
                              </th>
                              <th className="py-2 pr-3 text-xs font-medium text-ink-muted">
                                Tier
                              </th>
                              {metric === 'memory' ? (
                                <>
                                  <th className="py-2 pr-3 text-right text-xs font-medium text-ink-muted">
                                    Memory Allocated
                                  </th>
                                  <th className="py-2 pr-3 text-right text-xs font-medium text-ink-muted">
                                    Memory Used
                                  </th>
                                  <th className="py-2 pr-3 text-right text-xs font-medium text-ink-muted">
                                    Utilization
                                  </th>
                                  <th className="py-2 text-right text-xs font-medium text-ink-muted">
                                    Promotion
                                  </th>
                                </>
                              ) : (
                                <>
                                  <th className="py-2 pr-3 text-right text-xs font-medium text-ink-muted">
                                    CPU Time
                                  </th>
                                  <th className="py-2 pr-3 text-right text-xs font-medium text-ink-muted">
                                    Wall Time
                                  </th>
                                  <th className="py-2 text-right text-xs font-medium text-ink-muted">
                                    Promotion
                                  </th>
                                </>
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {allResults.map((r) => {
                              const allocated = getAllocatedMemory(r)
                              const used = r.peak_memory_bytes
                              const utilPct = allocated > 0 ? `${((used / allocated) * 100).toFixed(1)}%` : '—'
                              return (
                                <tr key={r.approach} className="border-b border-line last:border-0">
                                  <td className="py-2.5 pr-3 font-medium capitalize text-ink">
                                    {r.approach}
                                  </td>
                                  <td className="py-2.5 pr-3">
                                    <StatusChip tone={verdictTone(r.verdict)}>{r.verdict}</StatusChip>
                                  </td>
                                  <td className="py-2.5 pr-3">
                                    <StatusChip tone={tierTone(r.tier_started)} mono={false}>
                                      {tierLabel(r.tier_started)}
                                    </StatusChip>
                                  </td>
                                  {metric === 'memory' ? (
                                    <>
                                      <td className="py-2.5 pr-3 text-right font-mono text-xs text-ink tabular-nums">
                                        {formatAllocatedMemory(r)}
                                      </td>
                                      <td className="py-2.5 pr-3 text-right font-mono text-xs font-semibold text-ink tabular-nums">
                                        {formatBytes(used)}
                                      </td>
                                      <td className="py-2.5 pr-3 text-right font-mono text-xs text-ink-muted tabular-nums">
                                        {utilPct}
                                      </td>
                                      <td className="py-2.5 text-right font-mono text-xs text-ink-muted tabular-nums">
                                        {r.tier_promoted ? `Promoted (${r.promotion_time_ms} ms)` : 'None'}
                                      </td>
                                    </>
                                  ) : (
                                    <>
                                      <td className="py-2.5 pr-3 text-right font-mono text-xs text-ink tabular-nums">
                                        {r.cpu_time_ms} ms
                                      </td>
                                      <td className="py-2.5 pr-3 text-right font-mono text-xs text-ink tabular-nums">
                                        {r.wall_time_ms} ms
                                      </td>
                                      <td className="py-2.5 text-right font-mono text-xs text-ink-muted tabular-nums">
                                        {r.tier_promoted ? `Promoted (${r.promotion_time_ms} ms)` : 'None'}
                                      </td>
                                    </>
                                  )}
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>

                      <p className="mt-3 text-xs text-ink-muted">
                        Submissions were executed sequentially. Switch the metric to compare
                        scheduling strategies.
                      </p>
                    </Panel>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  )
}
