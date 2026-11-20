import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

type Palette = Record<'bg' | 'surface' | 'soft' | 'line' | 'fg' | 'muted' | 'accent' | 'onaccent' | 'accent2' | 'good' | 'bad' | 'warn', string>

export const THEMES: Record<string, { label: string; hint: string; p: Palette }> = {
  claro: {
    label: 'Claro', hint: 'Limpio, para pantallas con mucha luz',
    p: { bg: '243 245 249', surface: '255 255 255', soft: '237 241 247', line: '226 232 240', fg: '15 23 42', muted: '100 116 139',
      accent: '5 150 105', onaccent: '255 255 255', accent2: '37 99 235', good: '5 150 105', bad: '220 38 38', warn: '217 119 6' },
  },
  oscuro: {
    label: 'Oscuro', hint: 'Bajo contraste de brillo, ideal para la sala de video',
    p: { bg: '9 13 22', surface: '17 24 39', soft: '30 41 59', line: '48 62 84', fg: '241 245 249', muted: '148 163 184',
      accent: '52 211 153', onaccent: '6 40 30', accent2: '96 165 250', good: '52 211 153', bad: '248 113 113', warn: '251 191 36' },
  },
  estadio: {
    label: 'Estadio', hint: 'Verde césped con acentos lima',
    p: { bg: '5 27 19', surface: '9 42 30', soft: '15 61 44', line: '28 88 65', fg: '236 253 245', muted: '134 190 164',
      accent: '163 230 53', onaccent: '20 40 5', accent2: '45 212 191', good: '163 230 53', bad: '251 113 133', warn: '253 224 71' },
  },
  atardecer: {
    label: 'Atardecer', hint: 'Cálido y tenue, para sesiones largas',
    p: { bg: '27 15 23', surface: '42 23 35', soft: '62 34 48', line: '92 52 68', fg: '255 241 236', muted: '214 164 164',
      accent: '251 146 60', onaccent: '45 20 5', accent2: '244 114 182', good: '74 222 128', bad: '251 113 133', warn: '250 204 21' },
  },
}

const KEY = 'picksixers-theme'
type Ctx = { theme: string; setTheme: (t: string) => void; c: Record<keyof Palette, string> }
const ThemeCtx = createContext<Ctx>(null as unknown as Ctx)
export const useTheme = () => useContext(ThemeCtx)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<string>(() => {
    const saved = localStorage.getItem(KEY)
    return saved && THEMES[saved] ? saved : window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro'
  })
  const setTheme = (t: string) => { setThemeState(t); localStorage.setItem(KEY, t) }

  useEffect(() => {
    const root = document.documentElement
    for (const [k, v] of Object.entries(THEMES[theme].p)) root.style.setProperty(`--${k}`, v)
    root.dataset.theme = theme
    root.style.colorScheme = theme === 'claro' ? 'light' : 'dark'
  }, [theme])

  const c = useMemo(
    () => Object.fromEntries(Object.entries(THEMES[theme].p).map(([k, v]) => [k, `rgb(${v.split(' ').join(',')})`])) as Ctx['c'],
    [theme])
  return <ThemeCtx.Provider value={{ theme, setTheme, c }}>{children}</ThemeCtx.Provider>
}
