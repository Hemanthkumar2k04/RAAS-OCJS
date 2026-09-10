import type { Theme } from './theme'

export interface ChartTokens {
  accent: string
  ink: string
  inkMuted: string
  line: string
  surface: string
}

// Mirror of the design tokens in src/index.css (`:root` vs `.dark`).
// `--accent` is fixed across modes; the rest flip with the `.dark` class.
const LIGHT_TOKENS: ChartTokens = {
  accent: '#0ea5a5',
  ink: '#1a2323',
  inkMuted: '#5c6b6b',
  line: '#e4e8e8',
  surface: '#ffffff',
}

const DARK_TOKENS: ChartTokens = {
  accent: '#0ea5a5',
  ink: '#eaf0f0',
  inkMuted: '#8fa0a0',
  line: '#283333',
  surface: '#161d1d',
}

export function chartTokens(theme: Theme): ChartTokens {
  return theme === 'dark' ? DARK_TOKENS : LIGHT_TOKENS
}