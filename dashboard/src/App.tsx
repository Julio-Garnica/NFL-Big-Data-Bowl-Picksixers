import Defenses from './Defenses'
import Home from './Home'
import Offenses from './Offenses'
import Players from './Players'
import Qbs from './Qbs'
import Review from './Review'
import Simulator from './Simulator'
import { THEMES, useTheme } from './theme'
import { Icon, Loading, useApi, useRoute } from './ui'

export const NAV = [
  { id: 'inicio', label: 'Inicio', icon: 'home', hint: 'La pregunta y cómo se responde' },
  { id: 'revision', label: 'Revisión de jugadas', icon: 'review', hint: '¿Habría salido mejor la jugada?' },
  { id: 'simulador', label: 'Simulador', icon: 'target', hint: '¿Qué pasaría si…?' },
  { id: 'defensas', label: 'Defensas', icon: 'shield', hint: 'Perfiles de equipos y defensivos' },
  { id: 'ofensivas', label: 'Ofensivas', icon: 'line', hint: 'Cómo protege cada ofensiva a su QB' },
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
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2.5 md:px-6">
          <button type="button" onClick={() => go('inicio')} className="flex shrink-0 items-center gap-3 text-left" title="Inicio">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white p-1 shadow ring-1 ring-black/5">
              <img src="brand/fciencias.svg" alt="Escudo de la Facultad de Ciencias, UNAM" className="h-full w-full object-contain" />
            </span>
            <span className="hidden sm:block"><span className="block font-bold leading-tight">Picksixers</span>
              <span className="block text-xs text-muted">Decisiones bajo presión · Facultad de Ciencias, UNAM</span></span>
          </button>

          <nav className="hidden flex-1 items-center justify-center gap-0.5 xl:flex" aria-label="Secciones">
            {NAV.map(n => (
              <a key={n.id} href={`#/${n.id}`} title={n.hint} aria-current={page === n.id ? 'page' : undefined}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl px-2.5 py-2 text-sm font-medium transition ${page === n.id ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-soft hover:text-fg'}`}>
                <Icon name={n.icon} className="h-4 w-4" />{n.label}</a>))}
          </nav>

          <div className="ml-auto flex items-center gap-2 xl:ml-0">
            <Icon name="palette" className="h-4 w-4 text-muted" />
            <label htmlFor="tema" className="sr-only">Tema</label>
            <select id="tema" value={theme} onChange={e => setTheme(e.target.value)}
              className="rounded-lg border border-line bg-soft px-2 py-1.5 text-sm outline-none">
              {Object.entries(THEMES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
            </select>
          </div>
        </div>
        {/* Navegacion en pantallas medianas y pequenas */}
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2 xl:hidden" aria-label="Secciones">
          {NAV.map(n => (
            <a key={n.id} href={`#/${n.id}`} aria-current={page === n.id ? 'page' : undefined}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${page === n.id ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-soft'}`}>
              <Icon name={n.icon} className="h-4 w-4" />{n.label}</a>))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-6">
        {page !== 'inicio' && (
          <div className="mb-5">
            <h1 className="text-2xl font-bold">{cur.label}</h1>
            <p className="text-sm text-muted">{cur.hint}</p>
          </div>)}
        {!meta ? <Loading error={error} /> :
          page === 'inicio' ? <Home meta={meta} go={go} /> :
          page === 'revision' ? <Review meta={meta} parts={parts.slice(1)} go={go} /> :
          page === 'simulador' ? <Simulator meta={meta} /> :
          page === 'defensas' ? <Defenses meta={meta} parts={parts.slice(1)} go={go} /> :
          page === 'ofensivas' ? <Offenses parts={parts.slice(1)} go={go} /> :
          page === 'qbs' ? <Qbs meta={meta} parts={parts.slice(1)} go={go} /> :
          <Players go={go} />}
      </main>

      <footer className="border-t border-line px-6 py-4 text-center text-xs text-muted">
        Datos: NFL Big Data Bowl 2023 (temporada 2021, semanas 1-8), PFF y tracking. Fotos y logos: nfl.com y ESPN vía nflverse. Escudo de la Facultad de Ciencias, UNAM: Wikimedia Commons (dominio público).
      </footer>
    </div>
  )
}
