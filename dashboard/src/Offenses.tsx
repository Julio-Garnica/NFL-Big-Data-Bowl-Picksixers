import { useState } from 'react'
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { G } from './glossary'
import { PersonChip } from './shared'
import { Badge, Card, ChartCard, Headshot, Icon, Info, Loading, Meter, Segmented, Stat, TeamLogo, VsLeague, num, pct, useApi, useChart } from './ui'

export default function Offenses({ parts, go }: { parts: string[]; go: (p: string) => void }) {
  return parts[0] ? <OffenseProfile team={parts[0]} go={go} /> : <OffenseGrid go={go} />
}

// ---------------------------------------------------------------- lista de ofensivas
function OffenseGrid({ go }: { go: (p: string) => void }) {
  const { data, error } = useApi<any[]>('api/offense-teams')
  const [sort, setSort] = useState<'pressureRate' | 'sackRate' | 'timeToThrow' | 'name'>('pressureRate')
  if (!data) return <Loading error={error} />
  // Menos presion y menos sacks es mejor: se ordena de mejor a peor protección.
  const list = [...data].sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : a[sort] - b[sort])
  const lg = data.reduce((s, t) => s + t.pressureRate * t.dropbacks, 0) / data.reduce((s, t) => s + t.dropbacks, 0)
  return (
    <div className="space-y-4">
      <Card>
        <p className="text-sm">Elige una ofensiva para ver cómo protege a su QB: cuánta presión permite, contra qué situaciones sufre y qué bloqueadores permiten más presión.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm"><span className="text-muted">Ordenar por:</span>
          <Segmented value={sort} onChange={setSort} options={[{ v: 'pressureRate', label: 'Menos presión permitida' }, { v: 'sackRate', label: 'Menos sacks' },
            { v: 'timeToThrow', label: 'Pase más rápido' }, { v: 'name', label: 'Nombre' }]} />
        </div>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {list.map(t => (
          <button key={t.abbr} type="button" onClick={() => go(`ofensivas/${t.abbr}`)}
            className="fade-in overflow-hidden rounded-2xl border border-line bg-surface text-left shadow-card transition hover:-translate-y-0.5 hover:border-accent">
            <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${t.color}, ${t.color2})` }} />
            <div className="p-4">
              <div className="flex items-center gap-3"><TeamLogo abbr={t.abbr} size="h-12 w-12" />
                <div className="min-w-0"><div className="truncate font-semibold">{t.name}</div><div className="text-xs text-muted">{t.division}</div></div></div>
              <div className="mt-3 space-y-2 text-xs">
                <div><div className="mb-1 flex justify-between"><span className="flex items-center text-muted">Presión permitida<Info text={G.presionPermitida} /></span><b>{pct(t.pressureRate, 1)}</b></div>
                  <Meter v={t.pressureRate / 0.6} marker={lg / 0.6} tone={t.pressureRate < lg ? 'good' : 'bad'} /></div>
                <div className="flex justify-between"><span className="flex items-center text-muted">Sacks permitidos<Info text={G.sackRate} /></span><b>{pct(t.sackRate, 1)}</b></div>
                <div className="flex justify-between"><span className="flex items-center text-muted">Tiempo al pase<Info text={G.tiempoPase} /></span><b>{num(t.timeToThrow)} s</b></div>
              </div>
            </div>
          </button>))}
      </div>
      <p className="text-xs text-muted">La línea negra en cada barra marca el promedio de la liga. Verde = permite menos presión que el promedio.</p>
    </div>
  )
}

// ---------------------------------------------------------------- perfil de la ofensiva
function OffenseProfile({ team, go }: { team: string; go: (p: string) => void }) {
  const { data: o, error } = useApi(`api/offense/${team}`)
  const { grid, tick, tooltip, legend, c } = useChart()
  if (!o) return <Loading error={error} />
  const t = o.team

  return (
    <div className="space-y-4">
      <button type="button" onClick={() => go('ofensivas')} className="flex items-center gap-1 text-sm text-muted hover:text-accent"><Icon name="back" className="h-4 w-4" /> Todas las ofensivas</button>
      <section className="fade-in overflow-hidden rounded-3xl border border-line shadow-card"
        style={{ background: `linear-gradient(120deg, ${t.color}cc, ${t.color2}88 70%, rgb(var(--surface)))` }}>
        <div className="flex flex-wrap items-center gap-5 p-6 text-white">
          <div className="rounded-2xl bg-white/90 p-2"><TeamLogo abbr={t.abbr} size="h-20 w-20" /></div>
          <div className="min-w-0 flex-1"><div className="text-sm opacity-90">{t.conf} · {t.division}</div><h2 className="text-3xl font-extrabold drop-shadow">{t.name}</h2>
            <div className="text-sm opacity-90">Ofensiva · protección del QB · {o.dropbacks} dropbacks analizados</div></div>
          <button type="button" onClick={() => go(`defensas/${t.abbr}`)} className="rounded-xl bg-black/30 px-3 py-2 text-sm font-semibold hover:bg-black/40">Ver su defensa →</button>
        </div>
      </section>

      <Card>
        <div className="grid gap-5 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Presión permitida" value={pct(o.pressureRate, 1)} info={G.presionPermitida} sub={<VsLeague v={o.pressureRate} lg={o.leaguePressureRate} higherIsGood={false} />} />
          <Stat label="Sacks permitidos" value={pct(o.sackRate, 1)} info={G.sackRate} sub={<VsLeague v={o.sackRate} lg={o.leagueSackRate} higherIsGood={false} />} />
          <Stat label="Bloqueos perdidos por jugada" value={num(o.beatenPerDropback, 2)} info={G.bloqueosPerdidos}
            sub={<VsLeague v={o.beatenPerDropback} lg={o.leagueBeatenPerDropback} higherIsGood={false} fmt={x => num(x, 2)} />} />
          <Stat label="Tiempo al pase" value={`${num(o.timeToThrow)} s`} info={G.tiempoPase} sub={`liga ${num(o.leagueTimeToThrow)} s`} />
          <Stat label="Éxito ofensivo" value={pct(o.successRate)} info={G.exitosa} sub={<VsLeague v={o.successRate} lg={o.leagueSuccess} higherIsGood />} />
          <Stat label="Jugadas negativas" value={pct(o.negativeRate)} info={G.negativa} sub={<VsLeague v={o.negativeRate} lg={o.leagueNegative} higherIsGood={false} />} />
          <Stat label="Blitz recibido" value={pct(o.blitzFaced)} info={G.blitz} sub={`liga ${pct(o.leagueBlitzFaced)}`} />
          <Stat label="Usa bloqueadores extra" value={pct(o.extraBlockers)} info={G.bloqueadoresExtra} sub={`liga ${pct(o.leagueExtraBlockers)}`} />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <ProtectionChart title="¿Cómo le va contra el blitz?" data={o.byRushers} info={G.rushers + ' ' + G.blitz}
          howTo={<>Las barras <b className="text-bad">rojas</b> son la presión que permite según cuántos rushers manda el rival (eje izquierdo). La línea <b className="text-good">verde</b> es su % de jugadas exitosas (eje derecho).
            Si con 5 o más rushers la barra sube mucho y la línea cae, al rival le conviene blitzearla; prepara pases rápidos o protección extra. Revisa el número de jugadas: con pocas, el dato es frágil.</>} />
        <ProtectionChart title="¿Ayuda dejar bloqueadores extra?" data={o.byBlockers} info={G.bloqueadoresExtra}
          howTo={<>Compara la presión permitida (barras rojas) y el éxito (línea verde) cuando protege con 5, 6 o 7+ bloqueadores. Si con más bloqueadores baja la presión pero el éxito no cae,
            dejar a un TE o RB a bloquear es buena idea. Si el éxito cae, pierde más de lo que gana al quitar un receptor.</>} />
      </div>

      <Card title="Protección por situación" info="Presión, sacks y éxito de la ofensiva según down y distancia.">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted"><tr>
              <th className="py-2"><span className="flex items-center">Situación<Info text="Down y yardas por avanzar. 3.º corto = 4 yardas o menos." /></span></th>
              <th><span className="flex items-center">Jugadas<Info text={G.dropback} /></span></th>
              <th><span className="flex items-center">Presión permitida<Info text={G.presionPermitida} /></span></th>
              <th><span className="flex items-center">Sacks<Info text={G.sackRate} /></span></th>
              <th><span className="flex items-center">Éxito<Info text={G.exitosa} /></span></th>
              <th><span className="flex items-center">Tiempo al pase<Info text={G.tiempoPase} /></span></th></tr></thead>
            <tbody>{o.byContext.map((r: any) => (
              <tr key={r.label} className="border-t border-line"><td className="py-2">{r.label}</td><td>{r.n}</td>
                <td>{pct(r.pressureRate)}</td><td>{pct(r.sackRate, 1)}</td><td>{pct(r.successRate)}</td><td>{num(r.timeToThrow)} s</td></tr>))}</tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">Busca la fila con más presión permitida: es la situación en la que la defensa rival más va a atacar.</p>
      </Card>

      <Card title="Bloqueadores" info={`Jugadores con al menos 20 jugadas de protección, ordenados por jugadas. Tasa = presiones permitidas / jugadas de protección. Promedio de liga por bloqueador: ${pct(o.leagueBlockerRate, 1)}.`}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {o.blockers.map((b: any) => (
            <div key={b.id} className="flex gap-3 rounded-2xl border border-line p-3">
              <Headshot url={b.headshot} name={b.name} team={b.team} size="h-16 w-16" />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-1"><span className="truncate font-semibold">{b.name}</span><Badge tone="accent">{b.spot}</Badge></div>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  <div><div className="flex items-center text-muted">Jugadas</div><b>{b.snaps}</b></div>
                  <div><div className="flex items-center text-muted">Presiones<Info text="Presiones permitidas: apuros, golpes o sacks al QB atribuidos a este bloqueador por PFF." /></div><b>{b.pressures}</b></div>
                  <div><div className="flex items-center text-muted">Sacks<Info text="Sacks permitidos atribuidos a este bloqueador." /></div><b>{b.sacks}</b></div>
                  <div><div className="flex items-center text-muted">Tasa<Info text="Presiones permitidas / jugadas de protección. Menos es mejor." /></div>
                    <b className={b.rate > o.leagueBlockerRate ? 'text-bad' : 'text-good'}>{pct(b.rate, 1)}</b></div>
                </div>
                <div className="mt-1 text-[11px] text-muted">{b.hurries} apuros · {b.hits} golpes · vencido {b.beaten} veces<Info text={G.bloqueosPerdidos} /></div>
              </div>
            </div>))}
        </div>
        <p className="mt-3 text-xs text-muted">Tasa en <span className="text-bad">rojo</span>: permite más presión que el bloqueador promedio de la liga; en <span className="text-good">verde</span>: menos.</p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Quarterbacks que protege" info="QBs de este equipo con al menos 10 dropbacks.">
          <div className="grid gap-2">{o.qbs.map((q: any) => <PersonChip key={q.id} p={q} sub={`${q.dropbacks} dropbacks`} onClick={() => go(`qbs/${q.id}`)} />)}</div>
        </Card>
        <Card title="Rivales que más la presionaron" info="Defensivos de otros equipos con más presiones contra esta ofensiva.">
          <div className="grid gap-2 sm:grid-cols-2">{o.topRivals.map((p: any) => (
            <PersonChip key={p.id} p={p} sub={`${p.pressures} presiones`} onClick={() => go(`defensas/${p.team}/${p.id}`)} />))}</div>
        </Card>
      </div>
    </div>
  )
}

function ProtectionChart({ title, data, info, howTo }: { title: string; data: any[]; info: string; howTo: React.ReactNode }) {
  const { grid, tick, tooltip, legend, c } = useChart()
  return (
    <ChartCard title={title} info={info} howTo={howTo}>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={data}>
          <CartesianGrid {...grid} vertical={false} /><XAxis dataKey="label" tick={tick} />
          <YAxis yAxisId="l" tick={tick} tickFormatter={v => `${Math.round(v * 100)}%`} domain={[0, 1]} />
          <YAxis yAxisId="r" orientation="right" tick={tick} tickFormatter={v => `${Math.round(v * 100)}%`} domain={[0, 1]} />
          <Tooltip {...tooltip} formatter={(v: any) => pct(v, 1)} /><Legend {...legend} />
          <Bar yAxisId="l" dataKey="pressureRate" name="Presión permitida" fill={c.bad} radius={[6, 6, 0, 0]} />
          <Line yAxisId="r" dataKey="successRate" name="Éxito" stroke={c.good} strokeWidth={3} dot={{ r: 5 }} />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="text-xs text-muted">Jugadas: {data.map((r: any) => `${r.label}: ${r.n}`).join(' · ')}</p>
    </ChartCard>
  )
}
