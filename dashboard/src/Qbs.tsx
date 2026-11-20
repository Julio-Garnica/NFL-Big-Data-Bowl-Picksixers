import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { G } from './glossary'
import { PersonChip } from './shared'
import { useCheer } from './steelers'
import { Badge, Card, ChartCard, Headshot, Icon, Info, Loading, Segmented, Stat, TeamLogo, VsLeague, num, pct, useApi, useChart } from './ui'

export default function Qbs({ meta, parts, go }: { meta: any; parts: string[]; go: (p: string) => void }) {
  return parts[0] ? <QbProfile id={Number(parts[0])} go={go} /> : <QbGrid go={go} />
}

function QbGrid({ go }: { go: (p: string) => void }) {
  const { data, error } = useApi<any[]>('api/qbs')
  const [sort, setSort] = useState<'dropbacks' | 'successPressure' | 'pressureRate' | 'matchRate'>('dropbacks')
  if (!data) return <Loading error={error} />
  const list = [...data].sort((a, b) => (b[sort] ?? 0) - (a[sort] ?? 0))
  return (
    <div className="space-y-4">
      <Card>
        <p className="text-sm">Quarterbacks con al menos 60 dropbacks. Haz clic en uno para ver su perfil: cómo cambia su juego con presión y qué tan seguido toma la decisión recomendada.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm"><span className="text-muted">Ordenar por:</span>
          <Segmented value={sort} onChange={setSort} options={[{ v: 'dropbacks', label: 'Más jugadas' }, { v: 'successPressure', label: 'Éxito con presión' },
            { v: 'pressureRate', label: 'Presión recibida' }, { v: 'matchRate', label: 'Coincidencia' }]} />
        </div>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map(q => (
          <button key={q.id} type="button" onClick={() => go(`qbs/${q.id}`)}
            className="fade-in overflow-hidden rounded-2xl border border-line bg-surface text-left shadow-card transition hover:-translate-y-0.5 hover:border-accent">
            <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${q.teamInfo?.color}, ${q.teamInfo?.color2})` }} />
            <div className="flex gap-3 p-4">
              <Headshot url={q.headshot} name={q.name} team={q.teamInfo?.abbr} size="h-16 w-16" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><span className="truncate font-semibold">{q.name}</span><TeamLogo abbr={q.teamInfo?.abbr} size="h-5 w-5" />
                  {q.mobile && <Badge tone="accent2">Corredor<Info text={G.corredor} /></Badge>}</div>
                <div className="text-xs text-muted">{q.dropbacks} dropbacks · presión en {pct(q.pressureRate)}</div>
                <div className="mt-2 grid grid-cols-3 gap-1 text-xs">
                  <div><div className="text-muted">Éxito limpio</div><b className="text-good">{pct(q.successClean)}</b></div>
                  <div><div className="text-muted">Con presión</div><b className="text-bad">{pct(q.successPressure)}</b></div>
                  <div><div className="text-muted">Coincide</div><b>{pct(q.matchRate)}</b></div>
                </div>
              </div>
            </div>
          </button>))}
      </div>
    </div>
  )
}

const MIX: [string, string, string][] = [
  ['shortRate', 'Pase corto', G.corto], ['deepRate', 'Pase profundo', G.profundo], ['throwawayRate', 'Tira el balón', G.throwaway],
  ['scrambleRate', 'Scramble', G.scramble], ['sackRate', 'Sack', G.sackRate], ['intRate', 'Intercepción', G.intRate],
]

function QbProfile({ id, go }: { id: number; go: (p: string) => void }) {
  const { data: q, error } = useApi(`api/qb/${id}`)
  useCheer(q?.teamInfo?.abbr)
  const { grid, tick, tooltip, legend, c } = useChart()
  if (!q) return <Loading error={error} />
  const t = q.teamInfo
  const mix = MIX.map(([k, label]) => ({ name: label, Limpio: q.clean[k], 'Con presión': q.pressure[k], 'Liga con presión': q.league.pressure[k] }))

  return (
    <div className="space-y-4">
      <button type="button" onClick={() => go('qbs')} className="flex items-center gap-1 text-sm text-muted hover:text-accent"><Icon name="back" className="h-4 w-4" /> Todos los QBs</button>
      <section className="fade-in overflow-hidden rounded-3xl border border-line shadow-card"
        style={{ background: `linear-gradient(120deg, ${t?.color ?? '#334155'}dd, ${t?.color2 ?? '#64748b'}99 65%, rgb(var(--surface)))` }}>
        <div className="flex flex-wrap items-end gap-6 p-6 text-white">
          <Headshot url={q.headshot} name={q.name} team={q.teamInfo?.abbr} size="h-32 w-32" ring="ring-white/70" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm opacity-90"><span className="rounded bg-white/90 p-0.5"><TeamLogo abbr={t?.abbr} size="h-6 w-6" /></span>{t?.name} · QB</div>
            <h2 className="text-4xl font-extrabold drop-shadow">{q.name}</h2>
            <div className="mt-2 flex flex-wrap gap-2 text-sm">
              <span className="rounded-lg bg-black/25 px-2 py-0.5">{q.dropbacks} dropbacks</span>
              <span className="rounded-lg bg-black/25 px-2 py-0.5">{q.mobile ? 'QB corredor' : 'QB de bolsillo'}</span>
            </div>
          </div>
        </div>
      </section>

      <Card title="Lo que usa el simulador" info="Estas cifras alimentan la revisión de jugadas y el simulador cuando eliges a este QB.">
        <div className="grid gap-5 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Presión recibida" value={pct(q.pressureRate, 1)} info={G.presion} sub={<VsLeague v={q.pressureRate} lg={q.leaguePressureRate} higherIsGood={false} />} />
          <Stat label="Blitz enfrentado" value={pct(q.blitzFaced)} info={G.blitz} sub={`liga ${pct(q.leagueBlitzFaced)}`} />
          <Stat label="Éxito con presión" value={pct(q.pressure.successRate)} tone="bad" info={G.exitosa} sub={<VsLeague v={q.pressure.successRate} lg={q.league.pressure.successRate} higherIsGood />} />
          <Stat label="Éxito bolsillo limpio" value={pct(q.clean.successRate)} tone="good" info={G.exitosa} sub={<VsLeague v={q.clean.successRate} lg={q.league.clean.successRate} higherIsGood />} />
          <Stat label="Negativas con presión" value={pct(q.pressure.negativeRate)} info={G.negativa} sub={<VsLeague v={q.pressure.negativeRate} lg={q.league.pressure.negativeRate} higherIsGood={false} />} />
          <Stat label="Coincide con la recomendación" value={pct(q.all.matchRate)} info={G.coincidencia} sub={`liga ${pct(q.league.all.matchRate)}`} />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <ChartCard title="Qué hace cuando lo presionan" info="Porcentaje de sus dropbacks que terminan en cada acción."
          howTo={<>Compara sus decisiones con bolsillo <b className="text-good">limpio</b>, con <b className="text-bad">presión</b> y lo que hace un QB promedio con presión (gris).
            Si su barra roja de "Sack" es más alta que la gris, sostiene el balón demasiado; si "Tira el balón" es más alta, protege el balón. Un QB que cambia poco entre verde y rojo es estable bajo presión.</>}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={mix}>
              <CartesianGrid {...grid} vertical={false} /><XAxis dataKey="name" tick={tick} interval={0} />
              <YAxis tick={tick} tickFormatter={v => `${Math.round(v * 100)}%`} />
              <Tooltip {...tooltip} formatter={(v: any) => pct(v, 1)} /><Legend {...legend} />
              <Bar dataKey="Limpio" fill={c.good} radius={[4, 4, 0, 0]} /><Bar dataKey="Con presión" fill={c.bad} radius={[4, 4, 0, 0]} />
              <Bar dataKey="Liga con presión" fill={c.muted} fillOpacity={0.5} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <Card title="Limpio vs. presión">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted"><tr><th className="py-2"></th><th><span className="flex items-center">Limpio<Info text="Sus dropbacks sin presión." /></span></th><th><span className="flex items-center">Presión<Info text={G.presion} /></span></th><th><span className="flex items-center">Liga presión<Info text="Promedio de todos los QBs en dropbacks con presión, para comparar." /></span></th></tr></thead>
            <tbody>
              {([
                ['Dropbacks', 'n', null, (v: any) => String(v)],
                ['Éxito', 'successRate', G.exitosa, (v: any) => pct(v)],
                ['Negativas', 'negativeRate', G.negativa, (v: any) => pct(v)],
                ['Yardas/dropback', 'yardsPerDropback', G.ydsDropback, (v: any) => num(v)],
                ['Completos', 'completion', G.completion, (v: any) => pct(v)],
                ['Tiempo al pase', 'timeToThrow', G.tiempoPase, (v: any) => `${num(v)} s`],
                ['Coincide con recomendación', 'matchRate', G.coincidencia, (v: any) => pct(v)],
                ['Fallidas que habrían salido mejor', 'betterRate', G.pMejor, (v: any) => pct(v)],
              ] as [string, string, string | null, (v: any) => string][]).map(([label, k, info, f]) => (
                <tr key={k} className="border-t border-line">
                  <td className="py-2"><span className="flex items-center">{label}{info && <Info text={info} />}</span></td>
                  <td>{f(q.clean[k])}</td><td>{f(q.pressure[k])}</td><td className="text-muted">{f(q.league.pressure[k])}</td></tr>))}
            </tbody>
          </table>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Éxito por down: limpio vs. presión" info={G.exitosa}
          howTo={<>Para cada down, la barra verde es su % de éxito con bolsillo limpio y la roja con presión. La distancia entre ambas es cuánto le cuesta la presión en ese down.
            Si la caída es grande en 3.º/4.º down, conviene darle más protección o pases rápidos en esa situación.</>}>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={q.byDown}>
              <CartesianGrid {...grid} vertical={false} /><XAxis dataKey="down" tick={tick} />
              <YAxis tick={tick} tickFormatter={v => `${Math.round(v * 100)}%`} domain={[0, 1]} />
              <Tooltip {...tooltip} formatter={(v: any) => pct(v, 1)} /><Legend {...legend} />
              <Bar dataKey="successClean" name="Éxito limpio" fill={c.good} radius={[4, 4, 0, 0]} />
              <Bar dataKey="successPressure" name="Éxito con presión" fill={c.bad} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <Card title="Contra el blitz" info={G.blitz}>
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted"><tr><th className="py-2"><span className="flex items-center">Rushers<Info text={G.rushers} /></span></th><th>Jugadas</th>
              <th><span className="flex items-center">Presión<Info text={G.presion} /></span></th>
              <th><span className="flex items-center">Éxito<Info text={G.exitosa} /></span></th>
              <th><span className="flex items-center">Sack<Info text={G.sackRate} /></span></th></tr></thead>
            <tbody>{q.byRushers.map((r: any) => (
              <tr key={r.rushers} className="border-t border-line"><td className="py-2">{r.rushers}</td><td>{r.n}</td>
                <td>{pct(r.pressureRate)}</td><td>{pct(r.successRate)}</td><td>{pct(r.sackRate, 1)}</td></tr>))}</tbody>
          </table>
          <p className="mt-2 text-xs text-muted">Si su éxito sube cuando le mandan 5 o más, castiga el blitz; si baja mucho, las defensas deberían blitzearlo.</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Defensivos que más lo presionaron">
          <div className="grid gap-2 sm:grid-cols-2">
            {q.topPressers.map((p: any) => <PersonChip key={p.id} p={p} sub={`${p.pressures} presiones`} onClick={() => go(`defensas/${p.team}/${p.id}`)} />)}
          </div>
        </Card>
        <Card title="Jugadas donde la recomendación tenía más probabilidad de mejorar" info={G.pMejor}>
          <div className="space-y-2">
            {q.missed.map((m: any) => (
              <button key={`${m.gameId}-${m.playId}`} type="button" onClick={() => go(`revision/${m.gameId}/${m.playId}`)}
                className="w-full rounded-xl border border-line p-2.5 text-left text-xs transition hover:border-accent">
                <div className="flex justify-between"><b>Recomendado: {m.rec}</b><span className="text-warn">{pct(m.pBetter)} de salir mejor</span></div>
                <p className="mt-1 line-clamp-2 text-muted">{m.desc}</p>
              </button>))}
          </div>
        </Card>
      </div>
    </div>
  )
}



