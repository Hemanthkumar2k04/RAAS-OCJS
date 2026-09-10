import { useEffect, useState, type ReactNode } from 'react'
import {
  ThemeContext,
  applyDocumentClass,
  initialTheme,
  type Theme,
} from '../theme'

export default function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(initialTheme)

  // Keep the <html>.dark class in sync and persist the choice.
  useEffect(() => {
    applyDocumentClass(theme)
    try {
      localStorage.setItem('raas-theme', theme)
    } catch {
      /* non-fatal */
    }
  }, [theme])

  const setTheme = (t: Theme) => setThemeState(t)
  const toggle = () => setThemeState((p) => (p === 'dark' ? 'light' : 'dark'))

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}
