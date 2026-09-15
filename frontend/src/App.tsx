import { useEffect, useState } from 'react'
import ThemeProvider from './components/ThemeProvider'
import ThemeToggle from './components/ThemeToggle'
import CodeEditor from './components/CodeEditor'
import StatusChip from './components/StatusChip'
import StrategyBarChart from './components/StrategyBarChart'
import TestCaseChart from './components/TestCaseChart'
import { Panel, MetricStat } from './components/ui'
import { tierTone, verdictTone } from './status'

const BACKEND_URL = 'http://localhost:3000'

const TEST_CASES = [
  { input: '5 7\n', expected: '12\n' },
  { input: '10 20\n', expected: '30\n' },
]

const STRATEGIES = ['Baseline', 'Predictive', 'Reactive', 'Hybrid', 'Run all four strategies'] as const
type Strategy = (typeof STRATEGIES)[number]

const RUN_ALL = ['baseline', 'predictive', 'reactive', 'hybrid'] as const

type CodeLanguage = 'C' | 'C++' | 'Java' | 'Python'
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

const STARTER_CODE: Record<CodeLanguage, string> = {
  Python: `a, b = map(int, input().split())
print(a + b)
`,
  'C++': `#include <iostream>
using namespace std;
int main() {
    int a, b;
    if (cin >> a >> b) {
        cout << a + b << endl;
    }
    return 0;
}
`,
  Java: `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (sc.hasNextInt()) {
            int a = sc.nextInt();
            int b = sc.nextInt();
            System.out.println(a + b);
        }
    }
}
`,
  C: `#include <stdio.h>
int main() {
    int a, b;
    if (scanf("%d %d", &a, &b) == 2) {
        printf("%d\\n", a + b);
    }
    return 0;
}
`,
}

interface CaseResult {
  verdict: string
  cpu_time_ms: number
  peak_memory_bytes: number
}

interface JudgeResult {
  submission_id: string
  approach: string
  verdict: string
  cpu_time_ms: number
  peak_memory_bytes: number
  wall_time_ms: number
  tier_started: string
  tier_promoted: boolean
  promotion_time_ms: number
  cases: CaseResult[]
}

type ComparisonMetric = 'cpu_time_ms' | 'wall_time_ms' | 'peak_memory_bytes'

const METRICS: ComparisonMetric[] = ['cpu_time_ms', 'wall_time_ms', 'peak_memory_bytes']

const METRIC_LABELS: Record<ComparisonMetric, string> = {
  cpu_time_ms: 'CPU time',
  wall_time_ms: 'Wall time',
  peak_memory_bytes: 'Peak memory',
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

function formatMetric(metric: ComparisonMetric, result: JudgeResult): string {
  if (metric === 'peak_memory_bytes') return formatBytes(result[metric])
  return `${result[metric]} ms`
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
  const [language, setLanguage] = useState<CodeLanguage>('Python')
  const [strategy, setStrategy] = useState<Strategy>('Predictive')
  const [source, setSource] = useState(STARTER_CODE.Python)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [singleResult, setSingleResult] = useState<JudgeResult | null>(null)
  const [allResults, setAllResults] = useState<JudgeResult[] | null>(null)
  const [metric, setMetric] = useState<ComparisonMetric>('cpu_time_ms')
  const [status, setStatus] = useState<BackendStatus>('checking')
  const [runSeq, setRunSeq] = useState(0)

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

  async function submitOne(approach: string): Promise<JudgeResult> {
    const payload = {
      id: `sub-${Date.now()}`,
      language: apiLanguage(language),
      source,
      test_cases: TEST_CASES,
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
    ? allResults.map((r) => ({ strategy: r.approach, tier: r.tier_started, value: r[metric] }))
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
              <Panel className="p-5">
                <div className="flex items-center justify-between gap-2">
                  <StatusChip mono={false} tone="muted">
                    Easy
                  </StatusChip>
                  <span className="text-xs text-ink-muted">Demo only</span>
                </div>
                <h2 className="mt-4 text-lg font-semibold leading-tight text-ink">
                  1. Add Two Numbers
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                  Read two integers separated by space from standard input and print their sum.
                </p>
              </Panel>

              <Panel className="flex flex-col gap-4 p-5">
                <h3 className="text-xs font-medium text-ink-muted">Test cases</h3>
                <div className="flex flex-col gap-3">
                  {TEST_CASES.map((tc, i) => (
                    <div key={i} className="grid grid-cols-2 gap-px border border-line bg-line">
                      <div className="min-w-0 bg-canvas p-3">
                        <div className="text-[11px] text-ink-muted">Input</div>
                        <pre className="mt-1.5 whitespace-pre-wrap font-mono text-sm text-ink">
                          {tc.input.trim() || '(empty)'}
                        </pre>
                      </div>
                      <div className="min-w-0 bg-canvas p-3">
                        <div className="text-[11px] text-ink-muted">Expected</div>
                        <pre className="mt-1.5 whitespace-pre-wrap font-mono text-sm text-ink">
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
                      onChange={(e) => {
                        const lang = e.target.value as CodeLanguage
                        setLanguage(lang)
                        setSource(STARTER_CODE[lang])
                        setSingleResult(null)
                        setAllResults(null)
                      }}
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

                  <div className="ml-auto">
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
                      <div className="mt-5 grid grid-cols-1 gap-px border border-line bg-line sm:grid-cols-3">
                        <MetricStat label="CPU time" value={`${singleResult.cpu_time_ms} ms`} />
                        <MetricStat label="Wall time" value={`${singleResult.wall_time_ms} ms`} />
                        <MetricStat label="Peak memory" value={formatBytes(singleResult.peak_memory_bytes)} />
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
                                metric === 'peak_memory_bytes' ? formatBytes(v) : `${v} ms`
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
                      <div className="flex flex-col divide-y divide-line border-t border-line">
                        {singleResult.cases.map((c, i) => (
                          <div
                            key={i}
                            className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 py-2.5"
                          >
                            <span className="text-sm text-ink-muted">Case {i + 1}</span>
                            <StatusChip tone={verdictTone(c.verdict)}>{c.verdict}</StatusChip>
                            <span className="font-mono text-sm text-ink tabular-nums">
                              {c.cpu_time_ms} ms
                            </span>
                          </div>
                        ))}
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
                            metricLabel={METRIC_LABELS[metric]}
                            formatValue={(v) =>
                              metric === 'peak_memory_bytes' ? formatBytes(v) : `${v} ms`
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
                        <table className="w-full min-w-[560px] text-sm">
                          <thead>
                            <tr className="border-b border-line text-left">
                              <th className="py-2 pr-4 text-xs font-medium text-ink-muted">
                                Strategy
                              </th>
                              <th className="py-2 pr-4 text-xs font-medium text-ink-muted">
                                Verdict
                              </th>
                              <th className="py-2 pr-4 text-xs font-medium text-ink-muted">
                                Tier
                              </th>
                              <th className="py-2 text-right text-xs font-medium text-ink-muted">
                                {METRIC_LABELS[metric]}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {allResults.map((r) => (
                              <tr key={r.approach} className="border-b border-line last:border-0">
                                <td className="py-2.5 pr-4 font-medium capitalize text-ink">
                                  {r.approach}
                                </td>
                                <td className="py-2.5 pr-4">
                                  <StatusChip tone={verdictTone(r.verdict)}>{r.verdict}</StatusChip>
                                </td>
                                <td className="py-2.5 pr-4">
                                  <StatusChip tone={tierTone(r.tier_started)} mono={false}>
                                    {tierLabel(r.tier_started)}
                                  </StatusChip>
                                </td>
                                <td className="py-2.5 text-right font-mono text-ink tabular-nums">
                                  {formatMetric(metric, r)}
                                </td>
                              </tr>
                            ))}
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
