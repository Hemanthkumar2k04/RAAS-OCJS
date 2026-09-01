import { useEffect, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'

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

const METRIC_LABELS: Record<ComparisonMetric, string> = {
  cpu_time_ms: 'CPU Time (ms)',
  wall_time_ms: 'Wall Time (ms)',
  peak_memory_bytes: 'Peak Memory',
}

function verdictClass(verdict: string): string {
  switch (verdict) {
    case 'AC':
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
    case 'WA':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/30'
    default:
      return 'bg-rose-500/10 text-rose-400 border-rose-500/30'
  }
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

function CodeEditor({
  language,
  value,
  onChange,
}: {
  language: CodeLanguage
  value: string
  onChange: (v: string) => void
}) {
  const [usingTextarea, setUsingTextarea] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // If Monaco hasn't mounted (e.g. CDN unreachable), fall back to a textarea.
    timer.current = setTimeout(() => setUsingTextarea(true), 6000)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  const fallback = (
    <textarea
      className="h-full w-full resize-none bg-slate-900 p-4 font-mono text-sm leading-relaxed text-slate-200 outline-none"
      spellCheck={false}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  )

  if (usingTextarea) return fallback

  return (
    <div className="h-full">
      <Editor
        height="100%"
        language={monacoLanguage(language)}
        theme="vs-dark"
        value={value}
        onChange={(v) => onChange(v ?? '')}
        loading={fallback}
        onMount={() => {
          if (timer.current) clearTimeout(timer.current)
        }}
        options={{
          fontSize: 14,
          fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, monospace",
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 4,
          padding: { top: 12, bottom: 12 },
        }}
      />
    </div>
  )
}

function MetricSection({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-bold text-slate-100">{value}</div>
    </div>
  )
}

export default function App() {
  const [language, setLanguage] = useState<CodeLanguage>('Python')
  const [strategy, setStrategy] = useState<Strategy>('Predictive')
  const [source, setSource] = useState(STARTER_CODE.Python)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [singleResult, setSingleResult] = useState<JudgeResult | null>(null)
  const [allResults, setAllResults] = useState<JudgeResult[] | null>(null)
  const [metric, setMetric] = useState<ComparisonMetric>('cpu_time_ms')
  const [status, setStatus] = useState<'checking' | 'online' | 'offline'>('checking')

  useEffect(() => {
    const check = async () => {
      try {
        await fetch(`${BACKEND_URL}/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
          signal: AbortSignal.timeout(4000),
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
    } catch {
      setError('Unable to connect to judge backend (http://localhost:3000)')
      setSingleResult(null)
      setAllResults(null)
    } finally {
      setRunning(false)
    }
  }

  const statusDot =
    status === 'online' ? 'bg-emerald-500' : status === 'offline' ? 'bg-rose-500' : 'bg-amber-500'
  const statusText = status === 'online' ? 'Online' : status === 'offline' ? 'Offline' : 'Checking…'

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">RAAS-OJS</h1>
            <p className="hidden text-xs text-slate-400 sm:block">
              Resource-Aware Adaptive Scheduling for Online Judge Systems
            </p>
          </div>
          <div
            className="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm"
            title={`Judge backend ${BACKEND_URL}`}
          >
            <span className={`h-2.5 w-2.5 rounded-full ${statusDot} ${status === 'checking' ? 'animate-pulse' : ''}`} />
            <span className="font-medium text-slate-300">Backend: {statusText}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <section className="flex flex-col gap-6">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
            <div className="flex items-center justify-between">
              <span className="rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10">
                Easy
              </span>
              <span className="text-xs text-slate-500">Demo Only</span>
            </div>
            <h2 className="mt-3 text-xl font-bold text-white">1. Add Two Numbers</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Read two integers separated by space from standard input and print their sum.
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Test Cases</h3>
            <div className="mt-3 flex flex-col gap-3">
              {TEST_CASES.map((tc, i) => (
                <div key={i} className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-slate-950 border border-slate-800 p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Input</div>
                    <pre className="mt-1 font-mono text-sm text-slate-200">{tc.input.trim() || '(empty)'}</pre>
                  </div>
                  <div className="rounded-lg bg-slate-950 border border-slate-800 p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Expected</div>
                    <pre className="mt-1 font-mono text-sm text-emerald-300">{tc.expected.trim()}</pre>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-6">
          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
            <div className="flex flex-wrap items-center gap-3 border-b border-slate-800 px-4 py-3">
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-400">
                Language
                <select
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-blue-500"
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
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-400">
                Strategy
                <select
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-blue-500"
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
                  className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={handleRun}
                  disabled={running || status === 'offline'}
                >
                  {running ? 'Running…' : 'Run Code'}
                </button>
              </div>
            </div>
            <div className="h-[340px] border-b border-slate-800">
              <CodeEditor language={language} value={source} onChange={setSource} />
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4">
              <div className="flex items-center gap-2 font-semibold text-rose-400">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                {error}
              </div>
              <p className="mt-1 text-sm text-rose-300/80">
                Make sure the judge is running ({BACKEND_URL}) and the Docker runtime images are built.
              </p>
            </div>
          )}

          {singleResult && (
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Result</h3>
                <span
                  className={`rounded-md border px-2.5 py-1 text-sm font-bold ${verdictClass(singleResult.verdict)}`}
                >
                  {singleResult.verdict}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <MetricSection label="CPU Time" value={`${singleResult.cpu_time_ms} ms`} />
                <MetricSection label="Wall Time" value={`${singleResult.wall_time_ms} ms`} />
                <MetricSection label="Peak Memory" value={formatBytes(singleResult.peak_memory_bytes)} />
                <MetricSection label="Starting Tier" value={tierLabel(singleResult.tier_started)} />
                <MetricSection
                  label="Tier Promoted"
                  value={singleResult.tier_promoted ? 'Yes' : 'No'}
                  />
                <MetricSection label="Promotion Time" value={`${singleResult.promotion_time_ms} ms`} />
              </div>
              <h4 className="mt-6 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Cases ({singleResult.cases.length})
              </h4>
              <div className="mt-2 flex flex-col gap-2">
                {singleResult.cases.map((c, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950 px-4 py-2.5 text-sm"
                  >
                    <span className="text-slate-400">Case {i + 1}</span>
                    <span className={`rounded-md border px-2 py-0.5 font-bold ${verdictClass(c.verdict)}`}>
                      {c.verdict}
                    </span>
                    <span className="font-mono text-slate-400">{c.cpu_time_ms} ms</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {allResults && (
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
                  All Four Strategies
                </h3>
                <div className="flex rounded-lg border border-slate-700 bg-slate-950 p-1">
                  {(['cpu_time_ms', 'wall_time_ms', 'peak_memory_bytes'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMetric(m)}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                        metric === m
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {METRIC_LABELS[m]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500">
                      <th className="py-2 pr-4 font-semibold">Strategy</th>
                      <th className="py-2 pr-4 font-semibold">Verdict</th>
                      <th className="py-2 pr-4 font-semibold">Tier</th>
                      <th className="py-2 font-semibold">{METRIC_LABELS[metric]}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allResults.map((r) => (
                      <tr key={r.approach} className="border-b border-slate-800/60 last:border-0">
                        <td className="py-3 pr-4 font-semibold capitalize text-slate-200">{r.approach}</td>
                        <td className="py-3 pr-4">
                          <span
                            className={`rounded-md border px-2 py-0.5 text-xs font-bold ${verdictClass(r.verdict)}`}
                          >
                            {r.verdict}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-slate-400">{tierLabel(r.tier_started)}</td>
                        <td className="py-3 font-mono text-slate-200">
                          {formatMetric(metric, r)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Submissions were executed sequentially. Toggle the metric to compare scheduling strategies.
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}