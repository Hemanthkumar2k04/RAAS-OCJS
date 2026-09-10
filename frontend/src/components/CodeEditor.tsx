import { useEffect, useRef, useState, type ComponentProps } from 'react'
import Editor from '@monaco-editor/react'
import { useTheme } from '../theme'

// Derive the Monaco namespace type from the editor's own prop types so we
// don't need a direct `monaco-editor` dependency (it is loaded at runtime).
type BeforeMount = NonNullable<ComponentProps<typeof Editor>['beforeMount']>
type Monaco = Parameters<BeforeMount>[0]

const LIGHT_CANVAS = '#fafbfb'
const LIGHT_INK = '#1a2323'
const DARK_CANVAS = '#0f1414'
const DARK_INK = '#eaf0f0'
const ACCENT = '#0ea5a5'

function defineThemes(monaco: Monaco) {
  monaco.editor.defineTheme('raas-light', {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': LIGHT_CANVAS,
      'editor.foreground': LIGHT_INK,
      'editor.lineHighlightBackground': '#eef1f1',
      'editorLineNumber.foreground': '#5c6b6b',
      'editorLineNumber.activeForeground': LIGHT_INK,
      'editorCursor.foreground': ACCENT,
      'editor.selectionBackground': 'rgba(14, 165, 165, 0.22)',
      'editor.inactiveSelectionBackground': 'rgba(14, 165, 165, 0.12)',
      'editor.lineHighlightBorder': '#00000000',
      'editorGutter.background': LIGHT_CANVAS,
      'editorWidget.background': '#ffffff',
      'editorWidget.border': '#e4e8e8',
      'scrollbarSlider.background': '#c8d0d0',
      'scrollbarSlider.hoverBackground': '#a9b4b4',
    },
  })

  monaco.editor.defineTheme('raas-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': DARK_CANVAS,
      'editor.foreground': DARK_INK,
      'editor.lineHighlightBackground': '#1b2424',
      'editorLineNumber.foreground': '#4f5c5c',
      'editorLineNumber.activeForeground': DARK_INK,
      'editorCursor.foreground': ACCENT,
      'editor.selectionBackground': 'rgba(14, 165, 165, 0.32)',
      'editor.inactiveSelectionBackground': 'rgba(14, 165, 165, 0.16)',
      'editor.lineHighlightBorder': '#00000000',
      'editorGutter.background': DARK_CANVAS,
      'editorWidget.background': '#161d1d',
      'editorWidget.border': '#283333',
      'scrollbarSlider.background': '#283333',
      'scrollbarSlider.hoverBackground': '#344141',
    },
  })
}

interface CodeEditorProps {
  language: string
  value: string
  onChange: (value: string) => void
}

export default function CodeEditor({ language, value, onChange }: CodeEditorProps) {
  const { theme } = useTheme()
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
      className="h-full w-full resize-none bg-canvas p-4 font-mono text-sm leading-relaxed text-ink outline-none"
      spellCheck={false}
      aria-label="Code editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  )

  if (usingTextarea) return fallback

  return (
    <div className="h-full w-full" data-theme-editor>
      <Editor
        height="100%"
        language={language}
        theme={theme === 'dark' ? 'raas-dark' : 'raas-light'}
        value={value}
        onChange={(v) => onChange(v ?? '')}
        loading={fallback}
        beforeMount={defineThemes}
        onMount={() => {
          if (timer.current) clearTimeout(timer.current)
        }}
        options={{
          fontSize: 14,
          fontFamily: "'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, Menlo, monospace",
          fontLigatures: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 4,
          padding: { top: 14, bottom: 14 },
        }}
      />
    </div>
  )
}
