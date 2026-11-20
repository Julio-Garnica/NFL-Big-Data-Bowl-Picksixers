import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { G } from './glossary'
import { PersonChip } from './shared'
import { Badge, Card, ChartCard, Headshot, Icon, Info, Loading, Meter, Segmented, Stat, TeamLogo, VsLeague, num, pct, useApi, useChart } from './ui'

export default function Defenses({ meta, parts, go }: { meta: any; parts: string[]; go: (p: string) => void }) {
  const [team, pid] = parts
  if (team && pid) return <DefenderProfile team={team} pid={Number(pid)} go={go} />
  if (team) return <TeamProfile team={team} go={go} />
  return <TeamGrid go={go} />
}

// ---------------------------------------------------------------- lista de equipos
function TeamGrid({ go }: { go: (p: string) => void }) {
  const { data, error } = useApi<any[]>('api/teams')
  const [sort, setSort] = useState<'pressureRate' | 'blitzRate' | 'successAllowed' | 'name'>('pressureRate')
  if (!data) return <Loading error={error} />
  const list = [...data].sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'successAllowed' ? a[sort] - b[sort] : b[sort] - a[sort])
  const lg = data.reduce((s, t) => s + t.pressureRate * t.dropbacks, 0) / data.reduce((s, t) => s + t.dropbacks, 0)
  return (
    <div className="space-y-4">
      <Card>
        <p className="text-sm">Elige una defensa para ver su perfil: cómo y cuándo presiona, qué coberturas usa y la ficha de cada uno de sus defensivos.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm"><span className="text-muted">Ordenar por:</span>
          <Segmented value={sort} onChange={setSort} options={[{ v: 'pressureRate', label: 'Más presión' }, { v: 'blitzRate', label: 'Más blitz' },
            { v: 'successAllowed', label: 'Menos éxito permitido' }, { v: 'name', label: 'Nombre' }]} />
        </div>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {list.map(t => (
          <button key={t.abbr} type="button" onClick={() => go(`defensas/${t.abbr}`)}
            className="fade-in group overflow-hidden rounded-2xl border border-line bg-surface text-left shadow-card transition hover:-translate-y-0.5 hover:border-accent">
            <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${t.color}, ${t.color2})` }} />
            <div className="p-4">
              <div className="flex items-center gap-3"><TeamLogo abbr={t.abbr} size="h-12 w-12" />
                <div className="min-w-0"><div className="truncate font-semibold">{t.name}</div><div className="text-xs text-muted">{t.division}</div></div></div>
              <div className="mt-3 space-y-2 text-xs">
                <div><div className="mb-1 flex justify-between"><span className="flex items-center text-muted">Presión<Info text={G.presion} /></span><b>{pct(t.pressureRate, 1)}</b></div>
                  <Meter v={t.pressureRate / 0.6} marker={lg / 0.6} tone={t.pressureRate > lg ? 'good' : 'bad'} /></div>
                <div className="flex justify-between"><span className="flex items-center text-muted">Blitz<Info text={G.blitz} /></span><b>{pct(t.blitzRate)}</b></div>
                <div className="flex justify-between"><span className="flex items-center text-muted">Éxito permitido<Info text={G.exitoPermitido} /></span><b>{pct(t.successAllowed)}</b></div>
              </div>
            </div>
          </button>))}
      </div>
      <p className="text-xs text-muted">La línea negra en cada barra marca el promedio de la liga. Verde = presiona más que el promedio.</p>
    </div>
  )
}

// ---------------------------------------------------------------- perfil del equipo
function TeamProfile({ team, go }: { team: string; go: (p: string) => void }) {
  const { data: d, error } = useApi(`api/defense/${team}`)
  const { data: roster } = useApi<any[]>(`api/defense/${team}/players`)
  const [grp, setGrp] = useState('Todos')
  const { grid, tick, tooltip, legend, c } = useChart()
  const list = useMemo(() => (roster ?? []).filter(p => grp === 'Todos' || p.group === grp), [roster, grp])
  if (!d) return <Loading error={error} />
  const t = d.team

  return (
    <div className="space-y-4">
      <button type="button" onClick={() => go('defensas')} className="flex items-center gap-1 text-sm text-muted hover:text-accent"><Icon name="back" className="h-4 w-4" /> Todas las defensas</button>
      <section className="fade-in overflow-hidden rounded-3xl border border-line shadow-card"
        style={{ background: `linear-gradient(120deg, ${t.color}cc, ${t.color2}88 70%, rgb(var(--surface)))` }}>
        <div className="flex flex-wrap items-center gap-5 p-6 text-white">
          <div className="rounded-2xl bg-white/90 p-2"><TeamLogo abbr={t.abbr} size="h-20 w-20" /></div>
          <div><div className="text-sm opacity-90">{t.conf} · {t.division}</div><h2 className="text-3xl font-extrabold drop-shadow">{t.name}</h2>
            <div className="text-sm opacity-90">Defensa · {d.dropbacks} dropbacks rivales analizados</div></div>
        </div>
      </section>

      <Card>
        <div className="grid gap-5 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Presión generada" value={pct(d.pressureRate, 1)} info={G.presion} sub={<VsLeague v={d.pressureRate} lg={d.leaguePressureRate} higherIsGood />} />
          <Stat label="Sacks" value={pct(d.sackRate, 1)} info={G.sackRate} sub={<VsLeague v={d.sackRate} lg={d.leagueSackRate} higherIsGood />} />
          <Stat label="Blitz" value={pct(d.blitzRate)} info={G.blitz} sub={`liga ${pct(d.leagueBlitzRate)}`} />
          <Stat label="Cobertura al hombre" value={pct(d.manRate)} info={G.hombre} sub={`liga ${pct(d.leagueManRate)}`} />
          <Stat label="Éxito permitido" value={pct(d.successAllowed)} info={G.exitoPermitido} sub={<VsLeague v={d.successAllowed} lg={d.leagueSuccess} higherIsGood={false} />} />
          <Stat label="Jugadas negativas forzadas" value={pct(d.negativeForced)} info={G.negativaForzada} sub={<VsLeague v={d.negativeForced} lg={d.leagueNegative} higherIsGood />} />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="¿Le funciona mandar más rushers?" info={G.rushers}
          howTo={<>Las barras <b>rojas</b> son la tasa de presión según cuántos rushers manda (eje izquierdo). La línea <b>verde</b> es el % de jugadas exitosas que permite
            (eje derecho). Si al mandar más rushers sube la presión y baja la línea verde, el blitz le funciona. Revisa el número de jugadas (n) abajo: con pocas, el dato es frágil.</>}>
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={d.byRushers}>
              <CartesianGrid {...grid} vertical={false} /><XAxis dataKey="rushers" tick={tick} />
              <YAxis yAxisId="l" tick={tick} tickFormatter={v => `${Math.round(v * 100)}%`} domain={[0, 1]} />
              <YAxis yAxisId="r" orientation="right" tick={tick} tickFormatter={v => `${Math.round(v * 100)}%`} domain={[0, 1]} />
              <Tooltip {...tooltip} formatter={(v: any) => pct(v, 1)} /><Legend {...legend} />
              <Bar yAxisId="l" dataKey="pressureRate" name="Tasa de presión" fill={c.bad} radius={[6, 6, 0, 0]} />
              <Line yAxisId="r" dataKey="successAllowed" name="Éxito permitido" stroke={c.good} strokeWidth={3} dot={{ r: 5 }} />
            </ComposedChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted">Jugadas: {d.byRushers.map((r: any) => `${r.rushers} rushers: ${r.n}`).join(' · ')}</p>
        </ChartCard>
        <Card title="Cuándo ataca" info="Comportamiento de la defensa según la situación de down y distancia.">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted"><tr><th className="py-2"><span className="flex items-center">Situación<Info text="Down y yardas por avanzar. 3.º corto = 4 yardas o menos." /></span></th><th><span className="flex items-center">Jugadas<Info text={G.dropback} /></span></th>
                <th><span className="flex items-center">Blitz<Info text={G.blitz} /></span></th>
                <th><span className="flex items-center">Presión<Info text={G.presion} /></span></th>
                <th><span className="flex items-center">Hombre<Info text={G.hombre} /></span></th>
                <th><span className="flex items-center">Éxito perm.<Info text={G.exitoPermitido} /></span></th></tr></thead>
              <tbody>{d.byContext.map((r: any) => (
                <tr key={r.context} className="border-t border-line"><td className="py-2">{r.context}</td><td>{r.n}</td>
                  <td>{pct(r.blitzRate)}</td><td>{pct(r.pressureRate)}</td><td>{pct(r.manRate)}</td><td>{pct(r.successAllowed)}</td></tr>))}</tbody>
            </table>
          </div>
          <h4 className="mt-4 flex items-center text-xs font-semibold uppercase tracking-wider text-muted">Coberturas más usadas<Info text={G.cobertura} /></h4>
          <div className="mt-2 space-y-1.5">
            {d.coverageMix.map((cv: any) => (
              <div key={cv.coverage} className="flex items-center gap-2 text-xs"><span className="w-20 shrink-0">{cv.coverage}</span>
                <div className="flex-1"><Meter v={cv.share} tone="accent2" /></div><span className="w-10 text-right">{pct(cv.share)}</span></div>))}
          </div>
        </Card>
      </div>

      <Card title={`Defensivos de ${t.nick}`} info="Todos los jugadores que fueron rusher o cubrieron en al menos un dropback. Haz clic en uno para ver su perfil completo."
        right={<Segmented value={grp} onChange={setGrp} options={['Todos', 'DL', 'LB', 'DB'].map(v => ({ v, label: v }))} />}>
        {!roster ? <Loading error={null} /> : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {list.map(p => (
              <button key={p.id} type="button" onClick={() => go(`defensas/${team}/${p.id}`)}
                className="flex gap-3 rounded-2xl border border-line p-3 text-left transition hover:-translate-y-0.5 hover:border-accent">
                <Headshot url={p.headshot} name={p.name} team={p.team} size="h-16 w-16" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-1"><span className="truncate font-semibold">{p.name}</span><Badge tone="accent">{p.position}</Badge></div>
                  <div className="mt-2 grid grid-cols-3 gap-1 text-xs">
                    <div><div className="text-muted">Presiones</div><b>{p.pressures}</b></div>
                    <div><div className="text-muted">Sacks</div><b>{num(p.sacks, 1)}</b></div>
                    <div><div className="text-muted">Tasa</div><b>{p.pressureRate == null ? '–' : pct(p.pressureRate, 1)}</b></div>
                  </div>
                  <div className="mt-1 text-[11px] text-muted">{p.rushSnaps} rush · {p.coverSnaps} cobertura</div>
                </div>
              </button>))}
          </div>)}
        <p className="mt-3 text-xs text-muted">Tasa = presiones / jugadas de rush; "–" si tiene menos de 25 jugadas de rush.<Info text={G.tasaPresion} /></p>
      </Card>

      <button type="button" onClick={() => go(`ofensivas/${team}`)}
        className="flex w-full items-center justify-between rounded-2xl border border-line bg-surface p-4 text-left shadow-card transition hover:border-accent">
        <span className="flex items-center gap-3"><TeamLogo abbr={team} size="h-8 w-8" />
          <span><b>¿Quieres ver cómo protege su ofensiva?</b><span className="block text-xs text-muted">Presión permitida, bloqueadores y QBs en la página Ofensivas.</span></span></span>
        <Icon name="arrow" className="h-4 w-4 text-accent" />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------- perfil del defensivo
function DefenderProfile({ team, pid, go }: { team: string; pid: number; go: (p: string) => void }) {
  const { data: p, error } = useApi(`api/defender/${pid}`)
  const { grid, tick, tooltip, legend, c } = useChart()
  if (!p) return <Loading error={error} />
  const t = p.teamInfo, b = p.info
  const byDown = p.byDown.map((x: any) => ({ ...x, liga: p.groupPressureRate }))

  return (
    <div className="space-y-4">
      <button type="button" onClick={() => go(`defensas/${team}`)} className="flex items-center gap-1 text-sm text-muted hover:text-accent"><Icon name="back" className="h-4 w-4" /> Defensa de {t?.nick ?? team}</button>
      <section className="fade-in overflow-hidden rounded-3xl border border-line shadow-card"
        style={{ background: `linear-gradient(120deg, ${t?.color ?? '#334155'}dd, ${t?.color2 ?? '#64748b'}99 65%, rgb(var(--surface)))` }}>
        <div className="flex flex-wrap items-end gap-6 p-6 text-white">
          <Headshot url={p.headshot} name={p.name} team={p.team} size="h-32 w-32" ring="ring-white/70" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm opacity-90"><span className="rounded bg-white/90 p-0.5"><TeamLogo abbr={p.team} size="h-6 w-6" /></span>{t?.name} · {p.position} ({p.group})</div>
            <h2 className="text-4xl font-extrabold drop-shadow">{p.name}</h2>
            <div className="mt-2 flex flex-wrap gap-4 text-sm">
              <span>Estatura <b>{b.heightFt != null ? `${b.heightFt} ft ${b.heightIn} in` : '–'}</b></span>
              <span>Peso <b>{b.weightLb != null ? `${b.weightLb} lb` : '–'}</b></span>
              <span>Edad <b>{b.age ?? '–'}</b></span><span>Universidad <b>{b.college ?? '–'}</b></span>
            </div>
          </div>
        </div>
      </section>

      <Card title="Estadísticas de presión (semanas 1-8)">
        <div className="grid gap-5 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Presiones" value={String(p.pressures)} info={G.presionesJugador} tone="accent" />
          <Stat label="Sacks" value={num(p.sacks, 1)} info={G.sack} />
          <Stat label="Golpes" value={String(p.hits)} info={G.hit} />
          <Stat label="Apuros" value={String(p.hurries)} info={G.hurry} />
          <Stat label="Tasa de presión" value={p.pressureRate == null ? '–' : pct(p.pressureRate, 1)} info={G.tasaPresion}
            sub={<>{p.group} liga {pct(p.groupPressureRate, 1)}<Info text={G.promedioPosicion} /></>} />
          <Stat label="Percentil en su grupo" value={p.pressurePct == null ? '–' : String(Math.round(p.pressurePct * 100))} info={G.percentil} />
          <Stat label="Jugadas de rush" value={String(p.rushSnaps)} info={G.rushSnaps} sub={`${pct(p.rushShare)} de sus jugadas`} />
          <Stat label="Jugadas en cobertura" value={String(p.coverSnaps)} info={G.coverSnaps} />
          <Stat label="Bloqueos ganados" value={String(p.blockWins)} info={G.bloqueosGanados} />
          <Stat label="Doble marcaje" value={pct(p.doubleTeam)} info={G.dobleMarcaje} />
          <Stat label="Presión en 3.º/4.º down" value={pct(p.pressThird, 1)} info="Tasa de presión del jugador en 3.er y 4.º down, cuando la ofensiva más necesita el pase." sub={`${p.rushThird} jugadas`} />
          <Stat label="Yardas rivales cuando presiona" value={num(p.yardsWhenPressing)} info={G.yardsPressing} />
        </div>
        {!p.reliable && <p className="mt-3 text-xs text-warn">⚠ Menos de 25 jugadas de rush: la tasa de presión no es confiable.</p>}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Tasa de presión por down" info={G.tasaPresion}
          howTo={<>Cada barra es su tasa de presión en ese down. La línea punteada es el promedio de su grupo de posición ({p.group}). Si la barra supera la línea,
            presiona más que un jugador típico de su posición en esa situación. Un valor alto en 3.º/4.º down lo vuelve peligroso en downs de pase obligado.</>}>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={byDown}>
              <CartesianGrid {...grid} vertical={false} /><XAxis dataKey="down" tick={tick} />
              <YAxis tick={tick} tickFormatter={v => `${Math.round(v * 100)}%`} />
              <Tooltip {...tooltip} formatter={(v: any) => pct(v, 1)} />
              <ReferenceLine y={p.groupPressureRate} stroke={c.fg} strokeDasharray="5 5" label={{ value: `Promedio ${p.group}`, fill: c.muted, fontSize: 11, position: 'insideTopRight' }} />
              <Bar dataKey="pressureRate" name="Tasa de presión" fill={c.accent} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted">Jugadas de rush: {p.byDown.map((x: any) => `${x.down}: ${x.rushSnaps}`).join(' · ')}</p>
        </ChartCard>
        <ChartCard title="Presiones por semana" info="Jugadas de rush y presiones en cada semana de la temporada."
          howTo={<>Las barras grises son las jugadas en las que fue rusher esa semana; las de color, cuántas terminaron en presión. Sirve para ver si su producción es constante
            o depende de uno o dos partidos.</>}>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={p.weekly}>
              <CartesianGrid {...grid} vertical={false} /><XAxis dataKey="week" tick={tick} tickFormatter={v => `S${v}`} /><YAxis tick={tick} allowDecimals={false} />
              <Tooltip {...tooltip} labelFormatter={v => `Semana ${v}`} /><Legend {...legend} />
              <Bar dataKey="rushSnaps" name="Jugadas de rush" fill={c.muted} fillOpacity={0.4} radius={[6, 6, 0, 0]} />
              <Bar dataKey="pressures" name="Presiones" fill={c.accent} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Dónde se alinea" info="Posición en la que PFF lo marcó alineado antes del snap (por ejemplo ROLB = apoyador exterior derecho, DLT = tackle defensivo izquierdo).">
          <div className="space-y-2">
            {p.linedUp.map((l: any) => (
              <div key={l.spot} className="flex items-center gap-2 text-sm"><span className="w-14 shrink-0 font-semibold">{l.spot}</span>
                <div className="flex-1"><Meter v={l.share} tone="accent2" /></div><span className="w-12 text-right">{pct(l.share)}</span></div>))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <Stat label="Presión con blitz" value={pct(p.pressBlitz, 1)} info="Su tasa de presión cuando la defensa manda 5 o más rushers." />
            <Stat label="Presión sin blitz" value={pct(p.pressBase, 1)} info="Su tasa de presión cuando la defensa manda 4 o menos rushers." />
          </div>
        </Card>
        <Card title="QBs que más presionó" info="Quarterbacks a los que más veces apuró, golpeó o capturó.">
          <div className="grid gap-2">
            {p.victims.length === 0 && <p className="text-sm text-muted">Sin presiones registradas.</p>}
            {p.victims.map((v: any) => <PersonChip key={v.id} p={v} sub={`${v.pressures} presiones`} onClick={() => go(`qbs/${v.id}`)} />)}
          </div>
        </Card>
      </div>
    </div>
  )
}



