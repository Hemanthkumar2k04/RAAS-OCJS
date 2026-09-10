export type Tone = 'success' | 'danger' | 'warning' | 'heavy' | 'muted'

/**
 * Verdict code -> semantic tone.
 * Backend currently emits AC / WA / RE / SE; TLE / MLE / CE are mapped so the
 * status-color language stays complete and future-proof.
 */
export function verdictTone(verdict: string): Tone {
  switch (verdict) {
    case 'AC':
      return 'success'
    case 'WA':
    case 'RE':
    case 'CE':
    case 'SE':
      return 'danger'
    case 'TLE':
      return 'warning'
    case 'MLE':
      return 'heavy'
    default:
      return 'muted'
  }
}

/** Isolation tier -> semantic tone (low/Light = success, high/Heavy = heavy). */
export function tierTone(tier: string): Tone {
  const t = tier.toLowerCase()
  if (t === 'low' || t === 'light') return 'success'
  if (t === 'high' || t === 'heavy') return 'heavy'
  return 'muted'
}

export const TONE_CLASSES: Record<Tone, string> = {
  success: 'border-success/30 bg-success/10 text-success',
  danger: 'border-danger/30 bg-danger/10 text-danger',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  heavy: 'border-heavy/30 bg-heavy/10 text-heavy',
  muted: 'border-line bg-ink/5 text-ink-muted',
}
