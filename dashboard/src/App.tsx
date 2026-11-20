import Defenses from './Defenses'
import Home from './Home'
import Players from './Players'
import Qbs from './Qbs'
import Review from './Review'
import Simulator from './Simulator'
import { THEMES, useTheme } from './theme'
import { Icon, Loading, useApi, useRoute } from './ui'

export const NAV = [
  { id: 'inicio', label: 'Inicio', icon: 'home', hint: 'La pregunta y cómo se responde' },
  { id: 'revision', label: 'Revisión de jugadas', icon: 'review', hint: '¿Habría salido mejor?' },
  { id: 'simulador', label: 'Simulador', icon: 'target', hint: '¿Qué pasaría si…?' },
  { id: 'defensas', label: 'Defensas', icon: 'shield', hint: 'Perfiles de equipos y defensivos' },
  { id: 'qbs', label: 'Quarterbacks', icon: 'qb', hint: 'Cómo reacciona cada QB' },
  { id: 'jugadores', label: 'Jugadores', icon: 'users', hint: 'Directorio con fotos' },
] as const

export default function App() {
  const [parts, go] = useRoute()
  const page = NAV.find(n => n.id === parts[0])?.id ?? 'inicio'
  const { data: meta, error } = useApi('api/meta')
  const { theme, setTheme } = useTheme()
  const cur = NAV.find(n => n.id === page)!

  return (
    <div className="min-h-screen md:flex">
      <aside className="border-line bg-surface md:sticky md:top-0 md:h-screen md:w-64 md:shrink-0 md:border-r">
        <button type="button" onClick={() => go('inicio')} className="flex items-center gap-3 px-5 py-4 text-left">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent2 text-sm font-black text-onaccent shadow">P6</span>
          <div><div className="font-bold leading-tight">Picksixers</div><div className="text-xs text-muted">Decisiones bajo presión</div></div>
        </button>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible">
          {NAV.map(n => (
            <a key={n.id} href={`#/${n.id}`} aria-current={page === n.id ? 'page' : undefined}
              className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 transition ${page === n.id ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-soft hover:text-fg'}`}>
              <Icon name={n.icon} />
              <span><span className="block text-sm font-medium">{n.label}</span>
                <span className="hidden text-[11px] opacity-80 md:block">{n.hint}</span></span>
            </a>))}
        </nav>
        <div className="hidden px-5 pt-2 md:block">
          <label className="mb-1 block text-xs font-medium text-muted" htmlFor="tema">Tema</label>
          <select id="tema" value={theme} onChange={e => setTheme(e.target.value)}
            className="w-full rounded-lg border border-line bg-soft px-2.5 py-2 text-sm outline-none">
            {Object.entries(THEMES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
          </select>
          <p className="mt-6 text-[11px] leading-relaxed text-muted">Datos: NFL Big Data Bowl 2023 (temporada 2021, semanas 1-8), PFF y tracking. Fotos y logos: nfl.com y ESPN vía nflverse.</p>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 border-b border-line bg-bg/80 px-6 py-3 backdrop-blur">
          <h1 className="text-lg font-bold">{cur.label}</h1>
          <p className="text-xs text-muted">{cur.hint}</p>
        </header>
        <main className="mx-auto max-w-7xl p-4 md:p-6">
          {!meta ? <Loading error={error} /> :
            page === 'inicio' ? <Home meta={meta} go={go} /> :
            page === 'revision' ? <Review meta={meta} parts={parts.slice(1)} go={go} /> :
            page === 'simulador' ? <Simulator meta={meta} /> :
            page === 'defensas' ? <Defenses meta={meta} parts={parts.slice(1)} go={go} /> :
            page === 'qbs' ? <Qbs meta={meta} parts={parts.slice(1)} go={go} /> :
            <Players go={go} />}
        </main>
      </div>
    </div>
  )
}
