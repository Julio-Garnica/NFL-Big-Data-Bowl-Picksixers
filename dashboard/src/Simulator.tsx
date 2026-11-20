import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { G } from './glossary'
import { OptionTierChart } from './shared'
import { Card, ChartCard, Field, Headshot, Info, Loading, Segmented, Stat, TeamLogo, num, pct, selectCls, useApi, useChart } from './ui'

export default function Simulator({ meta }: { meta: any }) {
  const [down, setDown] = useState(3)
  const [ytg, setYtg] = useState(7)
  const [yte, setYte] = useState(45)
  const [rushers, setRushers] = useState(5)
  const [blockers, setBlockers] = useState(5)
  const [cov, setCov] = useState('Man')
  const [formation, setFormation] = useState('SHOTGUN')
  const [playAction, setPlayAction] = useState(false)
  const [rollout, setRollout] = useState(false)
  const [offTeam, setOffTeam] = useState('')
  const [defTeam, setDefTeam] = useState('')
  const [qb, setQb] = useState('')
  const { grid, tick, tooltip, c } = useChart()

  const url = useMemo(() => {
    const q = new URLSearchParams({ down: String(down), ytg: String(ytg), yardsToEndzone: String(yte), rushers: String(rushers),
      blockers: String(blockers), coverageType: cov, formation, playAction: String(playAction), rollout: String(rollout) })
    if (offTeam) q.set('offTeam', offTeam)
    if (defTeam) q.set('defTeam', defTeam)
    if (qb) q.set('qbId', qb)
    return `api/scenario?${q}`
  }, [down, ytg, yte, rushers, blockers, cov, formation, playAction, rollout, offTeam, defTeam, qb])
  const { data, error } = useApi(url)
  const qbObj = meta.qbs.find((q: any) => String(q.id) === qb)
  const drivers = meta.model.drivers.map((d: any) => ({ name: d.label, odds: d.oddsRatio }))

  return (
    <div className="grid gap-4 xl:grid-cols-[330px_1fr]">
      <Card title="Arma la situación">
        <div className="space-y-4">
          <Field label="Down"><Segmented value={down} onChange={setDown} options={[1, 2, 3, 4].map(v => ({ v, label: `${v}.º` }))} /></Field>
          <Field label={`Yardas por avanzar: ${ytg}`}><input type="range" min={1} max={20} value={ytg} onChange={e => setYtg(+e.target.value)} className="w-full" /></Field>
          <Field label={`Yardas a la zona de anotación: ${yte}`} info="Distancia hasta la zona de anotación rival. 20 o menos es zona roja.">
            <input type="range" min={1} max={99} value={yte} onChange={e => setYte(+e.target.value)} className="w-full" /></Field>
          <Field label="Rushers que espero de la defensa" info={G.rushers + ' ' + G.blitz}>
            <Segmented value={rushers} onChange={setRushers} options={[3, 4, 5, 6, 7].map(v => ({ v, label: String(v) }))} /></Field>
          <Field label="Mis bloqueadores" info={G.bloqueadores}><Segmented value={blockers} onChange={setBlockers} options={[5, 6, 7].map(v => ({ v, label: String(v) }))} /></Field>
          <Field label="Cobertura que espero" info={G.hombre}>
            <Segmented value={cov} onChange={setCov} options={[{ v: 'Zone', label: 'Zona' }, { v: 'Man', label: 'Hombre' }, { v: 'Other', label: 'Otra' }]} /></Field>
          <Field label="Formación"><select className={selectCls} value={formation} onChange={e => setFormation(e.target.value)}>
            {meta.formations.map((f: string) => <option key={f}>{f}</option>)}</select></Field>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-1"><input type="checkbox" checked={playAction} onChange={e => setPlayAction(e.target.checked)} /> Play action</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={rollout} onChange={e => setRollout(e.target.checked)} /> Rollout</label>
          </div>
          <Field label="Mi ofensiva" info="Ajusta la probabilidad de presión según cómo protege este equipo.">
            <div className="flex items-center gap-2"><TeamLogo abbr={offTeam || null} size="h-7 w-7" />
              <select className={selectCls} value={offTeam} onChange={e => setOffTeam(e.target.value)}>
                <option value="">Promedio de liga</option>{meta.teams.map((t: any) => <option key={t.abbr} value={t.abbr}>{t.name}</option>)}</select></div></Field>
          <Field label="Defensa rival" info="Ajusta la probabilidad de presión según cuánto presiona esta defensa.">
            <div className="flex items-center gap-2"><TeamLogo abbr={defTeam || null} size="h-7 w-7" />
              <select className={selectCls} value={defTeam} onChange={e => setDefTeam(e.target.value)}>
                <option value="">Promedio de liga</option>{meta.teams.map((t: any) => <option key={t.abbr} value={t.abbr}>{t.name}</option>)}</select></div></Field>
          <Field label="Mi quarterback" info={G.corredor}>
            <div className="flex items-center gap-2">{qbObj && <Headshot url={qbObj.headshot} name={qbObj.name} team={qbObj.team} size="h-8 w-8" />}
              <select className={selectCls} value={qb} onChange={e => setQb(e.target.value)}>
                <option value="">No especificado</option>{meta.qbs.map((q: any) => <option key={q.id} value={q.id}>{q.name}</option>)}</select></div></Field>
        </div>
      </Card>

      {!data ? <Loading error={error} /> : (
        <div className="min-w-0 space-y-4">
          <Card>
            <div className="grid gap-4 sm:grid-cols-4">
              <Stat label="Probabilidad de presión" value={pct(data.pPressure)} tone={data.pPressure > data.leagueAvg ? 'bad' : 'good'} info={G.pPresion}
                sub={`promedio de liga ${pct(data.leagueAvg)}`} />
              <Stat label="Riesgo de sack" value={pct(data.pSack, 1)} info="Probabilidad de que la jugada termine en sack, combinando el riesgo con presión y sin presión."
                sub={`con presión ${pct(data.states.pressure.sackRate)}`} />
              <Stat label="Necesita para ser exitosa" value={`${num(data.required, 1)} yd`} info={G.exitosa} />
              <Stat label="Tiempo al pase típico" value={`${num(data.states.clean.timeToThrow)} s`} info={G.tiempoPase}
                sub={`con presión ${num(data.states.pressure.timeToThrow)} s`} />
            </div>
            <p className="mt-4 rounded-xl bg-soft p-3 text-sm">
              <b>Recomendación:</b> diseña la jugada para un <b>{data.plan.label.toLowerCase()}</b>. Si llega la presión ({pct(data.pPressure)} de probabilidad),
              lo mejor según los datos es <b>{data.states.pressure.recLabel.toLowerCase()}</b>; si el bolsillo aguanta, <b>{data.states.clean.recLabel.toLowerCase()}</b>.
              {data.qbMobile === false && ' Tu QB no es corredor, así que no se le recomienda correr.'}
              {data.qbMobile == null && ' Elige un QB para saber si conviene que corra.'}
            </p>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <OptionTierChart options={data.states.pressure.options} highlight={data.states.pressure.rec} title="Si llega la presión" />
            <OptionTierChart options={data.states.clean.options} highlight={data.states.clean.rec} title="Si el bolsillo está limpio" />
          </div>

          <Card title="Detalle de cada opción" info={G.puntaje}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-muted"><tr>
                  <th className="py-2">Decisión</th>
                  <th><span className="flex items-center">Éxito (presión / limpio)<Info text={G.exitosa} /></span></th>
                  <th><span className="flex items-center">Negativa (presión / limpio)<Info text={G.negativa} /></span></th>
                  <th><span className="flex items-center">Puntaje mezcla<Info text={`${G.puntaje} La mezcla pondera presión y limpio con la probabilidad de presión de este escenario.`} /></span></th>
                  <th><span className="flex items-center">Yardas medias<Info text="Yardas promedio en jugadas parecidas con esta decisión." /></span></th>
                  <th><span className="flex items-center">Muestra (presión / limpio)<Info text={G.muestra} /></span></th>
                </tr></thead>
                <tbody>
                  {data.blend.map((o: any, i: number) => {
                    const pr = data.states.pressure.options[i], cl = data.states.clean.options[i]
                    return (
                      <tr key={o.key} className="border-t border-line">
                        <td className="py-2 font-medium">{o.label}</td>
                        <td>{pct(pr.pS)} / {pct(cl.pS)}</td><td>{pct(pr.pNeg)} / {pct(cl.pNeg)}</td>
                        <td className="font-semibold">{num(o.score, 2)}</td><td>{num(o.yards)}</td>
                        <td className="text-muted">{pr.neff == null ? 'fijo' : `${num(pr.neff, 0)}${pr.lowSample ? ' ⚠' : ''} / ${num(cl.neff, 0)}${cl.lowSample ? ' ⚠' : ''}`}</td>
                      </tr>)
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <ChartCard title="Qué aumenta o reduce la presión" info={`${G.odds} ${G.auc} AUC del modelo: ${num(meta.model.auc, 2)}.`}
            howTo={<>Cada barra es un factor del modelo de presión. La línea vertical marca 1 (sin efecto). Las barras que pasan de 1 <b>aumentan</b> la probabilidad de presión
              (por ejemplo 1.6 = 60 % más posibilidades); las que quedan por debajo la <b>reducen</b>. Úsala para decidir qué cambiar: más bloqueadores o un rollout bajan la presión.</>}>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={drivers} layout="vertical" margin={{ left: 20, right: 20 }}>
                <CartesianGrid {...grid} horizontal={false} />
                <XAxis type="number" domain={[0, 'auto']} tick={tick} />
                <YAxis type="category" dataKey="name" width={200} tick={tick} />
                <Tooltip {...tooltip} formatter={(v: any) => [`× ${num(v, 2)}`, 'Razón de momios']} />
                <ReferenceLine x={1} stroke={c.fg} strokeDasharray="4 4" />
                <Bar dataKey="odds" fill={c.accent2} radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>)}
    </div>
  )
}

