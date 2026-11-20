import type { ReactNode } from 'react'
import { G } from './glossary'
import { MY_TEAM } from './steelers'
import { Headshot, Icon, Info, TeamLogo, num, pct, useApi } from './ui'

type Step = { text: ReactNode; page: string; to: string }
type Role = { id: string; title: string; who: string; icon: string; question: string; steps: Step[]; decision: string }

/** Ejemplo con datos reales de nuestro equipo para cada rol. */
function useExamples() {
  const { data: off } = useApi(`api/offense/${MY_TEAM}`)
  const { data: def } = useApi(`api/defense/${MY_TEAM}`)
  const { data: roster } = useApi<any[]>(`api/defense/${MY_TEAM}/players`)
  const qbId = off?.qbs?.[0]?.id
  const { data: qb } = useApi(qbId ? `api/qb/${qbId}` : null)
  return { off, def, roster, qb }
}

export default function Roles({ go }: { go: (p: string) => void }) {
  const { off, def, roster, qb } = useExamples()
  const weakBlocker = off?.blockers?.filter((b: any) => b.snaps >= 100).sort((a: any, b: any) => b.rate - a.rate)[0]
  const worstSpot = off?.byContext?.filter((c: any) => c.n >= 10).sort((a: any, b: any) => b.pressureRate - a.pressureRate)[0]
  const topRusher = roster?.filter((p: any) => p.pressureRate != null).sort((a: any, b: any) => b.pressureRate - a.pressureRate)[0]
  const base = def?.byRushers?.[0], blitz = def?.byRushers?.[1]

  const roles: (Role & { example: ReactNode })[] = [
    {
      id: 'hc', title: 'Head coach', who: 'Decide el plan general y evalúa al QB', icon: 'qb',
      question: '¿Mi QB está tomando buenas decisiones bajo presión, y qué le pido al staff para la próxima semana?',
      steps: [
        { text: <>Abre <b>Revisión de jugadas</b> de su último partido con los filtros "con presión" y "no exitosas". Las jugadas marcadas <b>"habría salido mejor"</b> son los clips para la junta con el QB.</>, page: 'Revisión de jugadas', to: 'revision' },
        { text: <>En el <b>perfil del QB</b> compara su éxito con presión contra la liga y qué tan seguido coincide con la recomendación. Si coincide poco, el problema es de lectura; si coincide pero falla, es de ejecución o protección.</>, page: 'Quarterbacks', to: qb ? `qbs/${qb.id}` : 'qbs' },
        { text: <>Con el <b>Simulador</b> fija con los coordinadores la regla para 3.er down: qué decisión pedirle al QB si llega la presión y cuál si el bolsillo aguanta.</>, page: 'Simulador', to: 'simulador' },
      ],
      decision: 'Qué corregir con el QB, cuánta protección exigir y la regla de decisión en 3.er down.',
      example: qb && (
        <div className="flex items-center gap-3">
          <Headshot url={qb.headshot} name={qb.name} team={MY_TEAM} size="h-12 w-12" />
          <p className="text-xs">
            <b>{qb.name}</b> tiene <b className="text-bad">{pct(qb.pressure.successRate)}</b> de jugadas exitosas con presión (liga {pct(qb.league.pressure.successRate)})
            y elige lo recomendado en el <b>{pct(qb.all.matchRate)}</b> de sus dropbacks (liga {pct(qb.league.all.matchRate)}).
            <Info text={`${G.exitosa} ${G.coincidencia}`} />
          </p>
        </div>),
    },
    {
      id: 'oc', title: 'Coordinador ofensivo', who: 'Diseña la protección y las jugadas de pase', icon: 'line',
      question: '¿Cómo protejo a mi QB contra esta defensa y qué jugada llamo cuando sé que viene la presión?',
      steps: [
        { text: <>En <b>Ofensivas</b> (tu equipo) busca la situación con más presión permitida y el bloqueador con la tasa más alta: ahí va la ayuda de un TE o RB, o el deslizamiento de la línea.</>, page: 'Ofensivas', to: `ofensivas/${MY_TEAM}` },
        { text: <>En <b>Defensas</b> (el rival) revisa en qué downs blitzea, si juega hombre o zona y quiénes son sus rushers más peligrosos, con su foto y dónde se alinean.</>, page: 'Defensas', to: 'defensas' },
        { text: <>En el <b>Simulador</b> pon los rushers y la cobertura que esperas del rival. La recomendación "si llega la presión" te dice qué ruta caliente o pase rápido dejar listo en la jugada.</>, page: 'Simulador', to: 'simulador' },
      ],
      decision: 'El plan de protección, a quién ayudar en la línea y las jugadas con salida rápida contra el blitz.',
      example: off && (
        <div className="flex items-center gap-3">
          {weakBlocker && <Headshot url={weakBlocker.headshot} name={weakBlocker.name} team={MY_TEAM} size="h-12 w-12" />}
          <p className="text-xs">
            Nuestra línea permite presión en el <b>{pct(off.pressureRate)}</b> de los dropbacks (liga {pct(off.leaguePressureRate)}), pero sube a <b className="text-bad">{pct(worstSpot?.pressureRate)}</b> en {worstSpot?.label}.
            {weakBlocker && <> El bloqueador con más presión permitida es <b>{weakBlocker.name}</b> ({weakBlocker.spot}, {pct(weakBlocker.rate, 1)}).</>}
            <Info text={`${G.presionPermitida} Bloqueadores con al menos 100 jugadas.`} />
          </p>
        </div>),
    },
    {
      id: 'dc', title: 'Coordinador defensivo', who: 'Decide cuándo y con cuántos presionar', icon: 'shield',
      question: '¿Cuándo y con cuántos rushers ataco al QB rival, y por dónde?',
      steps: [
        { text: <>En <b>Quarterbacks</b> (el rival) mira cómo le va contra el blitz y si es corredor. Si su éxito cae con 5 o más rushers, blitzéalo; si es corredor, presiona sin abrir carriles para que corra.</>, page: 'Quarterbacks', to: 'qbs' },
        { text: <>En <b>Ofensivas</b> (el rival) encuentra su bloqueador más débil y la situación en la que más presión permite: pon a tu mejor rusher enfrente en esos downs.</>, page: 'Ofensivas', to: 'ofensivas' },
        { text: <>En <b>Defensas</b> (tu equipo) revisa si tu blitz realmente funciona (gráfico de rushers) y qué rushers presionan más por down, para planear las rotaciones.</>, page: 'Defensas', to: `defensas/${MY_TEAM}` },
      ],
      decision: 'Cuántos rushers mandar por situación, contra qué bloqueador alinear a cada rusher y cuándo contener al QB.',
      example: def && (
        <div className="flex items-center gap-3">
          {topRusher && <Headshot url={topRusher.headshot} name={topRusher.name} team={MY_TEAM} size="h-12 w-12" />}
          <p className="text-xs">
            Con 4 o menos rushers presionamos el <b>{pct(base?.pressureRate)}</b> y permitimos <b>{pct(base?.successAllowed)}</b> de éxito; con 5 sube la presión a <b>{pct(blitz?.pressureRate)}</b> y el éxito permitido queda en <b>{pct(blitz?.successAllowed)}</b>.
            {topRusher && <> Nuestro rusher más productivo es <b>{topRusher.name}</b> ({pct(topRusher.pressureRate, 1)} de presión, {num(topRusher.sacks, 1)} sacks).</>}
            <Info text={`${G.tasaPresion} ${G.exitoPermitido}`} />
          </p>
        </div>),
    },
  ]

  return (
    <section>
      <h2 className="flex items-center gap-2 text-xl font-bold">Cómo la usa el cuerpo técnico <TeamLogo abbr={MY_TEAM} size="h-6 w-6" /></h2>
      <p className="mb-4 text-sm text-muted">Cada rol tiene su propia pregunta. Estos son los pasos que proponemos para cada uno, con un ejemplo real de los Steelers.</p>
      <div className="grid gap-4 lg:grid-cols-3">
        {roles.map(r => (
          <article key={r.id} className="fade-in flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-card">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/15 text-accent"><Icon name={r.icon} /></span>
              <div><h3 className="text-lg font-bold leading-tight">{r.title}</h3><p className="text-xs text-muted">{r.who}</p></div>
            </div>
            <p className="mt-4 rounded-xl border-l-4 border-accent bg-soft p-3 text-sm font-semibold">{r.question}</p>
            <ol className="mt-4 flex-1 space-y-3">
              {r.steps.map((s, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-onaccent">{i + 1}</span>
                  <div>
                    <p>{s.text}</p>
                    <button type="button" onClick={() => go(s.to)} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline">
                      Ir a {s.page} <Icon name="arrow" className="h-3 w-3" /></button>
                  </div>
                </li>))}
            </ol>
            <div className="mt-4 rounded-xl bg-soft p-3">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Lo que decide</div>
              <p className="text-sm">{r.decision}</p>
            </div>
            <div className="mt-3 rounded-xl border border-[#FFB612]/50 bg-[#FFB612]/10 p-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Ejemplo con nuestros datos</div>
              {r.example || <p className="text-xs text-muted">Cargando…</p>}
            </div>
          </article>))}
      </div>

      <div className="mt-4 rounded-2xl border border-line bg-surface p-5 shadow-card">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">La semana de trabajo en conjunto</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          {[
            ['Después del partido', 'Head coach', 'Revisión de jugadas con presión: qué decisiones habrían salido mejor y por qué.'],
            ['Inicio de semana', 'Coordinadores', 'OC estudia la defensa rival; DC estudia al QB y la línea rival. Cada uno trae sus hallazgos.'],
            ['Plan de juego', 'Los tres', 'En el Simulador acuerdan la protección, cuándo blitzear y la regla de decisión del QB en 3.er down.'],
            ['Día del partido', 'Head coach', 'Usa los perfiles como hoja de referencia: qué espera del rival cuando presiona y cuando lo presionan.'],
          ].map(([when, who, what], i) => (
            <div key={when} className="rounded-xl bg-soft p-3">
              <div className="flex items-center gap-2"><span className="text-lg font-black text-accent">{i + 1}</span><b className="text-sm">{when}</b></div>
              <div className="text-xs text-accent2">{who}</div>
              <p className="mt-1 text-xs text-muted">{what}</p>
            </div>))}
        </div>
      </div>
    </section>
  )
}
