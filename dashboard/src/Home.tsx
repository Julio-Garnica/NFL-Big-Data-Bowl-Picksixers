import { Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { G } from './glossary'
import { TIERS } from './shared'
import { Card, ChartCard, Icon, Info, Stat, pct, useChart } from './ui'

const STEPS = [
  { icon: 'review', title: '1. Qué pasó', text: 'Tomamos cada dropback real: situación (down, distancia, campo), cuántos rushers mandó la defensa, la cobertura, si hubo presión y qué hizo el QB.' },
  { icon: 'scale', title: '2. Calificamos el resultado', text: 'Cada jugada queda como exitosa, neutra o negativa, con la regla estándar de éxito por down. Así un pase incompleto y un sack no valen lo mismo.' },
  { icon: 'data', title: '3. Lo comparamos con los datos', text: 'Buscamos jugadas parecidas con la misma presión y vemos qué pasó con cada decisión: pase corto, profundo, tirar el balón o correr.' },
  { icon: 'check', title: '4. Certificamos la probabilidad', text: 'Calculamos la probabilidad de que la decisión recomendada hubiera salido mejor, con un intervalo de confianza de 90 %. Solo afirmamos "habría salido mejor" si todo el intervalo supera 50 %.' },
]

const PAGES = [
  { id: 'revision', icon: 'review', title: 'Revisión de jugadas', what: 'Elige un partido y una jugada. Verás qué pasó, quién presionó, qué recomendaban los datos y la probabilidad de que hubiera salido mejor.', when: 'Después del partido, en la sala de video.' },
  { id: 'simulador', icon: 'target', title: 'Simulador', what: 'Arma una situación (down, distancia, rushers, cobertura) y ve la probabilidad de presión y qué decisión conviene si llega la presión o si el bolsillo está limpio.', when: 'Al preparar el plan de juego o la lista de jugadas de 3.er down.' },
  { id: 'defensas', icon: 'shield', title: 'Defensas', what: 'Perfil de cada defensa: cuánto y cuándo blitzea, qué coberturas usa y la ficha completa de cada defensivo con su foto y estadísticas de presión.', when: 'En la preparación semanal del rival.' },
  { id: 'ofensivas', icon: 'line', title: 'Ofensivas', what: 'Cómo protege cada ofensiva a su QB: presión y sacks permitidos, cómo le va contra el blitz, si le sirve dejar bloqueadores extra y qué bloqueadores permiten más presión.', when: 'Para planear la protección de tu equipo o encontrar la debilidad de la línea rival.' },
  { id: 'qbs', icon: 'qb', title: 'Quarterbacks', what: 'Perfil de cada QB con lo que usa el simulador: cómo cambia con presión, sacks, scrambles, tiempo al pase y qué tan seguido coincide con la recomendación.', when: 'Para saber qué esperar de tu QB o del rival cuando el bolsillo se rompe.' },
  { id: 'jugadores', icon: 'users', title: 'Jugadores', what: 'Directorio con foto, equipo, estatura (pies), peso (lb), edad y universidad. Te lleva al perfil del jugador si existe.', when: 'Consulta rápida.' },
]

export default function Home({ meta, go }: { meta: any; go: (p: string) => void }) {
  const { grid, tick, tooltip, legend, c } = useChart()
  const r = meta.review
  const [pr, cl] = r.byPressure
  const chart = r.byPressure.map((b: any) => ({ name: b.state, 'Exitosas': b.successRate, 'Negativas': b.negativeRate }))

  return (
    <div className="space-y-10">
      {/* ---------------------------------------------------------------- la pregunta */}
      <section className="fade-in relative overflow-hidden rounded-3xl border border-line p-8 shadow-card md:p-12"
        style={{ background: 'linear-gradient(135deg, rgb(var(--accent) / 0.20), rgb(var(--accent2) / 0.16) 55%, rgb(var(--surface)))' }}>
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-accent"><Icon name="question" className="h-4 w-4" /> La pregunta que respondemos</p>
        <div className="mt-3 flex items-center gap-6 md:gap-10">
          <h1 className="max-w-4xl flex-1 text-3xl font-extrabold leading-tight tracking-tight md:text-5xl">
            Cuando la defensa presiona al QB, ¿tomó la mejor decisión? Y si no, ¿qué probabilidad había de que la jugada saliera mejor?
          </h1>
          <img src="brand/nfl.png" alt="Logo de la NFL" className="hidden h-36 w-auto shrink-0 drop-shadow-xl sm:block md:h-48" />
        </div>
        <p className="mt-4 max-w-3xl text-muted">
          PickSixers revisa {meta.plays.toLocaleString()} dropbacks reales de {meta.games} partidos y compara lo que hizo el QB con lo que pasó en
          jugadas parecidas. El resultado es una recomendación y una probabilidad con su margen de confianza, que un head coach puede usar en la sala de video y en el plan de juego.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" onClick={() => go('revision')} className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-onaccent shadow hover:opacity-90">
            Revisar una jugada <Icon name="arrow" className="h-4 w-4" /></button>
          <button type="button" onClick={() => go('simulador')} className="rounded-xl border border-line bg-surface/70 px-5 py-2.5 text-sm font-semibold hover:bg-surface">Probar el simulador</button>
        </div>
      </section>

      {/* ---------------------------------------------------------------- como se responde */}
      <section>
        <h2 className="text-xl font-bold">Cómo la respondemos</h2>
        <p className="mb-4 text-sm text-muted">Cuatro pasos, aplicados a cada jugada.</p>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {STEPS.map(s => (
            <div key={s.title} className="fade-in rounded-2xl border border-line bg-surface p-5 shadow-card">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent"><Icon name={s.icon} /></span>
              <h3 className="mt-3 font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted">{s.text}</p>
            </div>))}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {[2, 1, 0].map(t => (
            <div key={t} className={`rounded-xl border p-3 text-sm ${t === 2 ? 'border-good/40 bg-good/10' : t === 0 ? 'border-bad/40 bg-bad/10' : 'border-line bg-soft'}`}>
              <b>{TIERS[t].label}.</b> <span className="text-muted">{TIERS[t].info.split(': ')[1] ?? TIERS[t].info}</span>
            </div>))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- hallazgos */}
      <section>
        <h2 className="text-xl font-bold">Lo que encontramos</h2>
        <p className="mb-4 text-sm text-muted">Resultados sobre todos los dropbacks de las semanas {meta.weeks[0]} a {meta.weeks[1]}.</p>
        <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <Card>
            <div className="grid grid-cols-2 gap-5">
              <Stat label="Éxito con presión" value={pct(pr.successRate)} tone="bad" info={G.exitosa}
                sub={`vs ${pct(cl.successRate)} con bolsillo limpio`} />
              <Stat label="Jugadas negativas con presión" value={pct(pr.negativeRate)} tone="bad" info={G.negativa}
                sub={`vs ${pct(cl.negativeRate)} con bolsillo limpio`} />
              <Stat label="Fallidas con presión que habrían salido mejor" value={pct(pr.betterRate)} tone="warn" info={G.pMejor + ' ' + G.ic90}
                sub={`de ${pr.failed.toLocaleString()} jugadas no exitosas con presión`} />
              <Stat label="QB eligió lo recomendado (con presión)" value={pct(pr.matchRate)} info={G.coincidencia}
                sub={`vs ${pct(cl.matchRate)} con bolsillo limpio`} />
            </div>
            <p className="mt-4 rounded-xl bg-soft p-3 text-sm">
              <b>En pocas palabras:</b> la presión baja la tasa de éxito de {pct(cl.successRate)} a {pct(pr.successRate)}. Cuando una jugada con presión no salió bien
              y el QB eligió distinto a la recomendación, en promedio la opción recomendada tenía <b>{pct(pr.avgPBetter)}</b> de probabilidad de salir mejor.
            </p>
          </Card>
          <ChartCard title="La presión cambia el resultado" info={G.presion}
            howTo={<>Compara el porcentaje de jugadas <b className="text-good">exitosas</b> y <b className="text-bad">negativas</b> cuando hubo presión y cuando no.
              Si la barra verde baja y la roja sube con presión, la presión está dañando a la ofensiva. La diferencia entre las barras es el costo de la presión.</>}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chart}>
                <CartesianGrid {...grid} vertical={false} /><XAxis dataKey="name" tick={tick} />
                <YAxis tick={tick} tickFormatter={v => `${Math.round(v * 100)}%`} domain={[0, 0.7]} />
                <Tooltip {...tooltip} formatter={(v: any) => pct(v, 1)} /><Legend {...legend} />
                <Bar dataKey="Exitosas" fill={c.good} radius={[6, 6, 0, 0]}><LabelList dataKey="Exitosas" position="top" formatter={(v: any) => pct(v)} fill={c.fg} fontSize={11} /></Bar>
                <Bar dataKey="Negativas" fill={c.bad} radius={[6, 6, 0, 0]}><LabelList dataKey="Negativas" position="top" formatter={(v: any) => pct(v)} fill={c.fg} fontSize={11} /></Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </section>

      {/* ---------------------------------------------------------------- guia */}
      <section>
        <h2 className="text-xl font-bold">Guía de la aplicación</h2>
        <p className="mb-4 text-sm text-muted">Qué hace cada página y cuándo usarla. Haz clic para abrirla. En toda la app, pasa el mouse sobre <Info text="Así se ven las definiciones: pasa el mouse sobre cualquier icono como este." /> para ver qué significa cada dato.</p>
        <div className="grid gap-4 md:grid-cols-2">
          {PAGES.map(g => (
            <button key={g.id} type="button" onClick={() => go(g.id)}
              className="fade-in group rounded-2xl border border-line bg-surface p-5 text-left shadow-card transition hover:-translate-y-0.5 hover:border-accent">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent"><Icon name={g.icon} /></span>
                <h3 className="text-lg font-semibold">{g.title}</h3>
                <Icon name="arrow" className="ml-auto h-4 w-4 text-muted transition group-hover:translate-x-1 group-hover:text-accent" />
              </div>
              <p className="mt-3 text-sm">{g.what}</p>
              <p className="mt-2 text-sm text-muted"><span className="font-semibold text-fg">Cuándo: </span>{g.when}</p>
            </button>))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- limites */}
      <section>
        <Card title="Qué tener en cuenta">
          <ul className="space-y-2 text-sm">
            <li><b>Son probabilidades, no certezas.</b> Comparamos con lo que pasó en jugadas parecidas; ninguna jugada es idéntica.</li>
            <li><b>Sesgo de selección.</b> Los QBs eligen según lo que ven (por ejemplo, corren cuando hay espacio). Por eso solo recomendamos correr a QBs corredores y bajo presión.</li>
            <li><b>Rushers y cobertura se conocen después del snap.</b> En el simulador funcionan como "lo que espero de la defensa".</li>
            <li><b>Muestra.</b> Son 8 semanas de una temporada. Cuando hay poca evidencia lo marcamos con ⚠.</li>
          </ul>
        </Card>
      </section>
    </div>
  )
}
