import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from './theme'

// ---------------------------------------------------------------- datos
// Rutas relativas sin diagonal inicial (el sitio se publica en una subruta).
const cache = new Map<string, any>()
export async function getJson<T = any>(path: string): Promise<T> {
  if (cache.has(path)) return cache.get(path)
  const r = await fetch(path)
  if (!r.ok) throw new Error(r.status === 404 ? 'No encontrado' : `Error ${r.status}`)
  const j = await r.json()
  cache.set(path, j)
  return j
}

export function useApi<T = any>(path: string | null) {
  const [data, setData] = useState<T | null>(path && cache.has(path) ? cache.get(path) : null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!path) { setData(null); return }
    let alive = true
    if (cache.has(path)) { setData(cache.get(path)); setError(null); return }
    setData(null)
    const t = setTimeout(() => {
      getJson<T>(path).then(d => { if (alive) { setData(d); setError(null) } })
        .catch(e => { if (alive) setError(String(e.message || e)) })
    }, 150)
    return () => { alive = false; clearTimeout(t) }
  }, [path])
  return { data, error }
}

export const pct = (v: number | null | undefined, d = 0) => (v == null ? '–' : `${(v * 100).toFixed(d)}%`)
export const num = (v: number | null | undefined, d = 1) => (v == null ? '–' : v.toFixed(d))

// ---------------------------------------------------------------- navegacion por hash: #/seccion/a/b
export function useRoute(): [string[], (path: string) => void] {
  const parse = () => location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent)
  const [parts, setParts] = useState<string[]>(parse)
  useEffect(() => {
    const on = () => setParts(parse())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const go = (path: string) => { location.hash = `/${path}`; window.scrollTo({ top: 0, behavior: 'smooth' }) }
  return [parts, go]
}

// ---------------------------------------------------------------- graficas
export function useChart() {
  const { c } = useTheme()
  return {
    c,
    grid: { stroke: c.line, strokeDasharray: '3 3' },
    tick: { fill: c.muted, fontSize: 11 },
    tooltip: {
      contentStyle: { background: c.surface, border: `1px solid ${c.line}`, borderRadius: 10, color: c.fg, fontSize: 12 },
      labelStyle: { color: c.fg, fontWeight: 600 }, itemStyle: { color: c.fg }, cursor: { fill: c.soft, opacity: 0.6 },
    },
    legend: { wrapperStyle: { color: c.muted, fontSize: 12 } },
    tiers: { s: c.good, n: c.muted, neg: c.bad },
  }
}

// ---------------------------------------------------------------- tooltip "i"
export function Info({ text, className = '' }: { text: ReactNode; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number; up: boolean } | null>(null)
  const show = () => {
    const r = ref.current!.getBoundingClientRect()
    setPos({ x: Math.min(Math.max(r.left + r.width / 2, 150), window.innerWidth - 150), y: r.top, up: r.top > 180 })
  }
  return (
    <>
      <span ref={ref} tabIndex={0} role="button" aria-label="Definición" onMouseEnter={show} onMouseLeave={() => setPos(null)}
        onFocus={show} onBlur={() => setPos(null)}
        className={`ml-1 inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full border border-muted/60 align-middle text-[10px] font-bold normal-case italic leading-none text-muted transition hover:border-accent hover:text-accent ${className}`}>i</span>
      {pos && createPortal(
        <div role="tooltip" className="pointer-events-none fixed z-[100] w-72 -translate-x-1/2 rounded-xl border border-line bg-surface p-3 text-left text-xs font-normal normal-case not-italic leading-relaxed tracking-normal text-fg shadow-2xl"
          style={{ left: pos.x, top: pos.up ? pos.y - 8 : pos.y + 24, transform: `translate(-50%, ${pos.up ? '-100%' : '0'})` }}>
          {text}
        </div>, document.body)}
    </>
  )
}

export function Label({ children, info }: { children: ReactNode; info?: ReactNode }) {
  return <span className="inline-flex items-center">{children}{info && <Info text={info} />}</span>
}

// ---------------------------------------------------------------- bloques
export function Card({ title, info, children, className = '', right }: {
  title?: ReactNode; info?: ReactNode; children: ReactNode; className?: string; right?: ReactNode
}) {
  return (
    <section className={`fade-in rounded-2xl border border-line bg-surface p-5 shadow-card ${className}`}>
      {(title || right) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h3 className="flex items-center text-xs font-semibold uppercase tracking-wider text-muted">{title}{info && <Info text={info} />}</h3>}
          {right}
        </div>)}
      {children}
    </section>
  )
}

/** Tarjeta de grafica con instrucciones de lectura siempre visibles. */
export function ChartCard({ title, info, howTo, children, className = '' }: {
  title: ReactNode; info?: ReactNode; howTo: ReactNode; children: ReactNode; className?: string
}) {
  return (
    <Card title={title} info={info} className={className}>
      {children}
      <div className="mt-3 flex gap-2 rounded-xl bg-soft p-3 text-xs leading-relaxed text-muted">
        <Icon name="book" className="mt-0.5 h-4 w-4 shrink-0 text-accent2" />
        <div><span className="font-semibold text-fg">Cómo leerla: </span>{howTo}</div>
      </div>
    </Card>
  )
}

export function Stat({ label, value, sub, info, tone }: {
  label: string; value: string; sub?: ReactNode; info?: ReactNode; tone?: 'good' | 'bad' | 'warn' | 'accent'
}) {
  const color = tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : tone === 'accent' ? 'text-accent' : ''
  return (
    <div className="min-w-0">
      <div className="flex items-center text-xs text-muted">{label}{info && <Info text={info} />}</div>
      <div className={`text-2xl font-bold tracking-tight ${color}`}>{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  )
}

/** Comparacion contra la liga: flecha y color segun si es mejor o peor. */
export function VsLeague({ v, lg, higherIsGood, fmt = (x: number) => pct(x, 1) }: {
  v: number | null; lg: number | null; higherIsGood: boolean; fmt?: (x: number) => string
}) {
  if (v == null || lg == null) return <span>liga {lg == null ? '–' : fmt(lg)}</span>
  const better = higherIsGood ? v > lg : v < lg
  return <span>liga {fmt(lg)} · <span className={better ? 'text-good' : 'text-bad'}>{v > lg ? '▲' : '▼'} {better ? 'mejor' : 'peor'}</span></span>
}

export function Segmented<T extends string | number>({ value, options, onChange }: {
  value: T; options: { v: T; label: ReactNode }[]; onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl bg-soft p-1">
      {options.map(o => (
        <button key={String(o.v)} type="button" onClick={() => onChange(o.v)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${o.v === value ? 'bg-accent text-onaccent shadow' : 'text-muted hover:text-fg'}`}>
          {o.label}
        </button>))}
    </div>
  )
}

export function Field({ label, info, children }: { label: string; info?: ReactNode; children: ReactNode }) {
  return <div className="block"><span className="mb-1 flex items-center text-xs font-medium text-muted">{label}{info && <Info text={info} />}</span>{children}</div>
}

export const selectCls = 'w-full rounded-lg border border-line bg-soft px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/50'

export function Loading({ error }: { error: string | null }) {
  return error
    ? <p className="rounded-xl border border-bad/40 bg-bad/10 p-4 text-sm text-bad">No se pudo cargar: {error}</p>
    : <div className="flex items-center gap-2 p-6 text-sm text-muted"><span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" /> Cargando…</div>
}

export function Badge({ children, tone = 'soft', className = '' }: { children: ReactNode; tone?: 'soft' | 'accent' | 'good' | 'bad' | 'warn' | 'accent2'; className?: string }) {
  const cls = { soft: 'bg-soft text-muted', accent: 'bg-accent/15 text-accent', good: 'bg-good/15 text-good', bad: 'bg-bad/15 text-bad', warn: 'bg-warn/15 text-warn', accent2: 'bg-accent2/15 text-accent2' }[tone]
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${cls} ${className}`}>{children}</span>
}

/** Barra horizontal de porcentaje. */
export function Meter({ v, tone = 'accent', marker }: { v: number | null; tone?: 'accent' | 'good' | 'bad' | 'warn' | 'accent2'; marker?: number | null }) {
  const bg = { accent: 'bg-accent', good: 'bg-good', bad: 'bg-bad', warn: 'bg-warn', accent2: 'bg-accent2' }[tone]
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-soft">
      <div className={`h-full rounded-full ${bg}`} style={{ width: `${Math.max(0, Math.min(1, v ?? 0)) * 100}%` }} />
      {marker != null && <div className="absolute top-0 h-full w-0.5 bg-fg" style={{ left: `${marker * 100}%` }} title="Promedio de liga" />}
    </div>
  )
}

// ---------------------------------------------------------------- imagenes
const initials = (n?: string | null) => (n ?? '?').split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()

export function Headshot({ url, name, team, size = 'h-14 w-14', ring = 'ring-line', className = '' }: {
  url?: string | null; name?: string | null; team?: string | null; size?: string; ring?: string; className?: string
}) {
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [url])
  return (
    <div className={`${size} shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-soft to-line ring-2 ${ring} ${className}`}>
      {url && !broken
        ? <img src={url} alt={name ?? ''} loading="lazy" onError={() => setBroken(true)} className="h-full w-full object-cover object-top" />
        : <div className="flex h-full w-full items-center justify-center text-sm font-bold text-muted">{initials(name)}</div>}
    </div>
  )
}

export function TeamLogo({ abbr, size = 'h-8 w-8', className = '' }: { abbr?: string | null; size?: string; className?: string }) {
  const [broken, setBroken] = useState(false)
  if (!abbr) return null
  return broken
    ? <span className={`${size} inline-flex shrink-0 items-center justify-center rounded-full bg-soft text-[10px] font-bold ${className}`}>{abbr}</span>
    : <img src={`teams/${abbr}.png`} alt={abbr} title={abbr} onError={() => setBroken(true)} className={`${size} shrink-0 object-contain ${className}`} />
}

// ---------------------------------------------------------------- iconos
const ICONS: Record<string, string> = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  review: 'M4 4h16v12H4zM8 20h8M12 16v4M8 9l2.5 2.5L16 7',
  target: 'M12 21a9 9 0 100-18 9 9 0 000 18zm0-5a4 4 0 100-8 4 4 0 000 8zm0-3a1 1 0 100-2 1 1 0 000 2z',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z',
  qb: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
  users: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2 20a7 7 0 0114 0M17 11a3 3 0 100-6M22 20a6 6 0 00-4-5.6',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  back: 'M19 12H5M11 6l-6 6 6 6',
  palette: 'M12 3a9 9 0 100 18c1.2 0 2-.8 2-1.8 0-.5-.2-.9-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1 .8-1.6 1.8-1.6H17a4 4 0 004-4c0-4.4-4-8-9-8z',
  book: 'M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2V5zM4 19a2 2 0 012-2h13',
  dice: 'M4 4h16v16H4zM8.5 8.5h.01M15.5 15.5h.01M15.5 8.5h.01M8.5 15.5h.01M12 12h.01',
  question: 'M12 21a9 9 0 100-18 9 9 0 000 18zM9.5 9a2.5 2.5 0 115 0c0 1.5-2.5 2-2.5 4M12 17h.01',
  data: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  scale: 'M12 3v18M5 7h14M5 7l-3 6a3 3 0 006 0L5 7zM19 7l-3 6a3 3 0 006 0l-3-6z',
  check: 'M5 12l5 5L20 7',
  line: 'M3 18h18M6 18v-5a2 2 0 012-2h0a2 2 0 012 2v5M14 18v-5a2 2 0 012-2h0a2 2 0 012 2v5M12 4l-4 4h8l-4-4z',
}
export function Icon({ name, className = 'h-5 w-5' }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={ICONS[name]} />
    </svg>
  )
}

