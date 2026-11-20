import { useEffect, useMemo, useState } from 'react'
import { G } from './glossary'
import { ACTIONS, CiBar, OptionTierChart, PersonChip, TierBadge, VERDICTS, VerdictBadge } from './shared'
import { Badge, Card, Field, Headshot, Icon, Info, Loading, Stat, TeamLogo, getJson, num, pct, selectCls, useApi } from './ui'

const downTxt = (d: number, y: number) => `${d}.º y ${y}`

export default function Review({ meta, parts, go }: { meta: any; parts: string[]; go: (p: string) => void }) {
  const gameId = parts[0] ? Number(parts[0]) : null
  const playId = parts[1] ? Number(parts[1]) : null
  const { data: games } = useApi<any[]>('api/games')
  const [team, setTeam] = useState<string>('')
  const [onlyPressure, setOnlyPressure] = useState(true)
  const [onlyFailed, setOnlyFailed] = useState(true)
  const [seed, setSeed] = useState(1)
  const game = games?.find(g => g.gameId === gameId)

  // Al abrir una jugada desde un enlace, preselecciona un equipo del partido (solo una vez por partido).
  useEffect(() => { if (game) setTeam(t => (t === game.home || t === game.away ? t : game.home)) }, [game?.gameId])
  const teamGames = useMemo(() => (games ?? []).filter(g => !team || g.home === team || g.away === team), [games, team])
  const { data: plays } = useApi<any[]>(gameId ? `api/games/${gameId}/plays` : null)
  const shown = (plays ?? []).filter(p => (!onlyPressure || p.pressure) && (!onlyFailed || p.tier < 2))

  const random = async (verdict: string) => {
    const r = await getJson(`api/review-random?verdict=${verdict}&pressure=1${team ? `&team=${team}` : ''}&seed=${seed}`)
    setSeed(s => s + 1)
    if (r.gameId) go(`revision/${r.gameId}/${r.playId}`)
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
      {/* ---------------------------------------------------------------- selector */}
      <div className="space-y-4">
        <Card title="1. Elige el equipo ofensivo">
          <div className="grid grid-cols-8 gap-1.5">
            <button type="button" onClick={() => setTeam('')} title="Todos"
              className={`col-span-8 mb-1 rounded-lg px-2 py-1 text-xs font-semibold ${!team ? 'bg-accent text-onaccent' : 'bg-soft text-muted'}`}>Todos los equipos</button>
            {meta.teams.map((t: any) => (
              <button key={t.abbr} type="button" onClick={() => setTeam(t.abbr)} title={t.name}
                className={`rounded-lg p-1 transition ${team === t.abbr ? 'bg-accent/20 ring-2 ring-accent' : 'hover:bg-soft'}`}>
                <TeamLogo abbr={t.abbr} size="h-7 w-7" /></button>))}
          </div>
        </Card>
        <Card title="2. Elige el partido">
          <select className={selectCls} value={gameId ?? ''} onChange={e => e.target.value && go(`revision/${e.target.value}`)}>
            <option value="">Selecciona…</option>
            {teamGames.map(g => <option key={g.gameId} value={g.gameId}>Semana {g.week} · {g.away} @ {g.home}</option>)}
          </select>
        </Card>
        {gameId && (
          <Card title="3. Elige la jugada">
            <div className="mb-2 flex flex-wrap gap-3 text-xs">
              <label className="flex items-center gap-1"><input type="checkbox" checked={onlyPressure} onChange={e => setOnlyPressure(e.target.checked)} /> Solo con presión<Info text={G.presion} /></label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={onlyFailed} onChange={e => setOnlyFailed(e.target.checked)} /> Solo no exitosas<Info text={G.exitosa} /></label>
            </div>
            {!plays ? <Loading error={null} /> : (
              <div className="max-h-[460px] space-y-1.5 overflow-y-auto pr-1">
                {shown.length === 0 && <p className="text-sm text-muted">No hay jugadas con estos filtros.</p>}
                {shown.map(p => (
                  <button key={p.playId} type="button" onClick={() => go(`revision/${gameId}/${p.playId}`)}
                    className={`w-full rounded-xl border p-2.5 text-left text-xs transition ${p.playId === playId ? 'border-accent bg-accent/10' : 'border-line hover:border-muted'}`}>
                    <div className="flex items-center gap-2">
                      <TeamLogo abbr={p.team} size="h-5 w-5" />
                      <span className="font-semibold">{p.quarter}C {p.clock} · {downTxt(p.down, p.ytg)}</span>
                      <span className="ml-auto"><VerdictBadge v={p.verdict} /></span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-muted">{p.desc}</p>
                  </button>))}
              </div>)}
          </Card>)}
        <Card title="O ve un ejemplo al azar" info="Elige una jugada con presión al azar (del equipo seleccionado si hay uno).">
          <div className="grid gap-2">
            {(['mejor', 'coincide', 'no_mejor'] as const).map(v => (
              <button key={v} type="button" onClick={() => random(v)}
                className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-left text-sm hover:border-accent">
                <Icon name="dice" className="h-4 w-4 text-accent" /> {VERDICTS[v].label}</button>))}
          </div>
        </Card>
      </div>

      {/* ---------------------------------------------------------------- detalle */}
      <div className="min-w-0">
        {gameId && playId ? <PlayReview key={`${gameId}-${playId}`} gameId={gameId} playId={playId} go={go} /> : <Intro meta={meta} />}
      </div>
    </div>
  )
}

function Intro({ meta }: { meta: any }) {
  const v = meta.review.verdicts
  return (
    <Card>
      <h2 className="text-2xl font-bold">¿Habría salido mejor la jugada?</h2>
      <p className="mt-2 text-muted">Elige un equipo, un partido y una jugada a la izquierda. Para cada jugada verás tres bloques:</p>
      <ol className="mt-4 space-y-3 text-sm">
        <li><b>1. Qué pasó:</b> situación, presión de la defensa (con las caras de quienes presionaron), qué hizo el QB y cómo terminó.</li>
        <li><b>2. Qué dicen los datos:</b> cómo terminaron jugadas parecidas, con la misma presión, según la decisión del QB.</li>
        <li><b>3. Veredicto:</b> la decisión recomendada y la probabilidad de que la jugada hubiera salido mejor, con su intervalo de confianza.</li>
      </ol>
      <h3 className="mt-6 text-sm font-semibold uppercase tracking-wider text-muted">Cómo se reparten los veredictos en toda la muestra</h3>
      <div className="mt-2 grid gap-2 sm:grid-cols-5">
        {Object.entries(VERDICTS).map(([k, m]) => (
          <div key={k} className="rounded-xl bg-soft p-3">
            <div className="text-xl font-bold">{pct(v[k])}</div>
            <div className="flex items-center text-xs text-muted">{m.short}<Info text={m.text} /></div>
          </div>))}
      </div>
    </Card>
  )
}

function PlayReview({ gameId, playId, go }: { gameId: number; playId: number; go: (p: string) => void }) {
  const { data, error } = useApi(`api/review/${gameId}/${playId}`)
  if (!data) return <Loading error={error} />
  const { play: p, analysis: a } = data
  const vm = VERDICTS[a.verdict]
  const rec = a.options.find((o: any) => o.key === a.rec)
  const pressureText = p.pressure
    ? [p.sacks && `${p.sacks} sack`, p.hits && `${p.hits} golpe${p.hits > 1 ? 's' : ''}`, p.hurries && `${p.hurries} apuro${p.hurries > 1 ? 's' : ''}`].filter(Boolean).join(', ')
    : 'Sin presión'

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------ 1. que paso */}
      <Card title="1. Qué pasó">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <TeamLogo abbr={p.offense.abbr} size="h-12 w-12" />
            <span className="text-sm text-muted">vs</span>
            <TeamLogo abbr={p.defense.abbr} size="h-12 w-12" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-lg font-bold">{p.offense.nick} con el balón · {downTxt(p.down, p.ytg)} en {p.fieldText}</div>
            <div className="text-sm text-muted">Semana {p.week} · {p.quarter}.º cuarto, {p.clock} · Marcador {p.scoreDiff > 0 ? `+${p.scoreDiff}` : p.scoreDiff} para la ofensiva</div>
          </div>
          <TierBadge tier={a.tier} />
        </div>
        <p className="mt-3 rounded-xl bg-soft p-3 text-sm italic">"{p.desc}"</p>

        <div className="mt-4 grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Presión" value={p.pressure ? 'Sí' : 'No'} tone={p.pressure ? 'bad' : 'good'} sub={pressureText} info={G.presion} />
          <Stat label="Prob. antes del snap" value={pct(p.pPressure)} info={G.pPresion} sub="de que hubiera presión" />
          <Stat label="Rushers" value={String(p.rushers)} sub={p.rushers >= 5 ? 'Blitz' : 'Sin blitz'} info={G.rushers + ' ' + G.blitz} />
          <Stat label="Bloqueadores" value={String(p.blockers)} info={G.bloqueadores} />
          <Stat label="Tiempo al pase" value={`${num(p.timeToEnd)} s`} info={G.tiempoPase} />
          <Stat label="Rusher más cerca" value={`${num(p.rusherMinDist)} yd`} info={G.rusherDist} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <Badge>{p.formation}</Badge><Badge>{p.coverage} ({p.coverageType === 'Man' ? 'hombre' : p.coverageType === 'Zone' ? 'zona' : 'otra'})<Info text={G.cobertura + ' ' + G.hombre} /></Badge>
          {p.playAction && <Badge>Play action</Badge>}<Badge>Decisión del QB: {ACTIONS[p.action] ?? p.action}</Badge>
          <Badge>Resultado: {num(p.yards, 0)} yd{p.isInt ? ' · intercepción' : ''}</Badge>
          <Badge>Necesitaba {num(a.required, 1)} yd para ser exitosa<Info text={G.exitosa} /></Badge>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Quarterback</h4>
            {p.qb && <PersonChip p={p.qb} sub={p.offense.abbr} onClick={() => go(`qbs/${p.qb.id}`)} />}
          </div>
          <div>
            <h4 className="mb-2 flex items-center text-xs font-semibold uppercase tracking-wider text-muted">Quién presionó<Info text={`${G.hurry} ${G.hit} ${G.sack}`} /></h4>
            <div className="space-y-2">
              {p.pressers.length === 0 && <p className="text-sm text-muted">Nadie llegó al QB.</p>}
              {p.pressers.map((x: any) => <PersonChip key={x.id} p={x} sub={x.kinds.join(', ')} onClick={() => go(`defensas/${p.defense.abbr}/${x.id}`)} />)}
            </div>
          </div>
          <div>
            <h4 className="mb-2 flex items-center text-xs font-semibold uppercase tracking-wider text-muted">Bloqueadores vencidos<Info text="Linieros o jugadores de protección que PFF marcó como vencidos por un defensor en esta jugada." /></h4>
            <div className="space-y-2">
              {p.beatenBlockers.length === 0 && <p className="text-sm text-muted">Ninguno.</p>}
              {p.beatenBlockers.map((x: any) => <PersonChip key={x.id} p={x} sub={x.lined} />)}
            </div>
          </div>
        </div>
      </Card>

      {/* ------------------------------------------------ 2. que dicen los datos */}
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <OptionTierChart options={a.options} highlight={a.rec} chosen={a.chosen}
          title={`2. Qué pasó en jugadas parecidas (${p.pressure ? 'con presión' : 'bolsillo limpio'})`} />
        <Card title="Opciones comparadas con lo que pasó" info={G.pMejor}>
          <div className="space-y-3">
            {a.options.map((o: any) => (
              <div key={o.key} className={`rounded-xl border p-3 ${o.key === a.rec ? 'border-accent bg-accent/5' : 'border-line'} ${o.allowed ? '' : 'opacity-50'}`}>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-semibold">{o.label}{o.key === a.rec && ' ★'}{o.key === a.chosen && <span className="ml-1 text-xs font-normal text-muted">(lo que hizo)</span>}</span>
                  <span className="flex items-center text-xs text-muted">puntaje {num(o.score, 2)}<Info text={G.puntaje} /></span>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex-1"><CiBar p={o.pB} ci={o.ci} /></div>
                  <div className="w-24 text-right text-sm"><b>{pct(o.pB)}</b><div className="text-[10px] text-muted">salir mejor</div></div>
                </div>
                <div className="mt-1 text-[11px] text-muted">
                  {o.deterministic ? 'Resultado fijo: siempre neutra.' : <>IC 90 %: {pct(o.ci[0])}–{pct(o.ci[1])} · muestra {num(o.neff, 0)}{o.lowSample && ' ⚠ poca evidencia'}</>}
                  {!o.allowed && ' · No se considera (el QB no es corredor o no hubo presión).'}
                </div>
              </div>))}
          </div>
          <p className="mt-3 rounded-xl bg-soft p-3 text-xs text-muted">
            <span className="font-semibold text-fg">Cómo leerlo: </span>la marca es la probabilidad de que esa decisión hubiera dado un mejor resultado que el real;
            la franja es el intervalo de confianza de 90 %. Si toda la franja queda a la derecha de la línea de 50 %, la mejora es probable.
          </p>
        </Card>
      </div>

      {/* ------------------------------------------------ 3. veredicto */}
      <section className={`fade-in rounded-2xl border-2 p-6 shadow-card ${vm.tone === 'warn' ? 'border-warn bg-warn/10' : vm.tone === 'good' ? 'border-good bg-good/10' : vm.tone === 'bad' ? 'border-bad bg-bad/10' : vm.tone === 'accent2' ? 'border-accent2 bg-accent2/10' : 'border-line bg-surface'}`}>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">3. Veredicto</h3>
        <div className="mt-2 grid gap-6 md:grid-cols-[1.4fr_1fr]">
          <div>
            <div className="text-2xl font-extrabold">{vm.label}</div>
            <p className="mt-2 text-sm">{vm.text}</p>
            <p className="mt-3 text-sm">
              El QB eligió <b>{a.chosenLabel}</b> y la jugada fue <b>{a.tierLabel.toLowerCase()}</b>. Los datos recomendaban <b>{a.recLabel}</b>
              {a.tier < 2 && <> : en jugadas parecidas esa opción habría dado un mejor resultado el <b>{pct(a.pBetter)}</b> de las veces
                (IC 90 %: {pct(a.ci[0])}–{pct(a.ci[1])}) y uno peor el {pct(a.pWorse)}</>}.
            </p>
          </div>
          {a.tier < 2 && (
            <div className="rounded-xl bg-surface/70 p-4">
              <Stat label="Probabilidad de que hubiera salido mejor" value={pct(a.pBetter)} tone="accent" info={G.pMejor}
                sub={<>con {a.recLabel.toLowerCase()}</>} />
              <div className="mt-3"><CiBar p={a.pBetter} ci={a.ci} /></div>
              <div className="mt-2 flex items-center text-xs text-muted">IC 90 %: {pct(a.ci[0])} a {pct(a.ci[1])}<Info text={G.ic90} />
                {a.nEff != null && <> · muestra {num(a.nEff, 0)}<Info text={G.muestra} /></>}</div>
            </div>)}
        </div>
      </section>

      {/* ------------------------------------------------ evidencia */}
      {rec && !rec.deterministic && a.similar.length > 0 && (
        <Card title={`Evidencia: jugadas más parecidas en las que el QB eligió ${a.recLabel.toLowerCase()}`} info={G.similares}>
          <div className="grid gap-2 md:grid-cols-2">
            {a.similar.map((s: any) => (
              <button key={`${s.gameId}-${s.playId}`} type="button" onClick={() => go(`revision/${s.gameId}/${s.playId}`)}
                className="rounded-xl border border-line p-3 text-left text-xs transition hover:border-accent">
                <div className="flex items-center gap-2"><TeamLogo abbr={s.team} size="h-5 w-5" />
                  <span className="font-semibold">{downTxt(s.down, s.ytg)} · {num(s.yards, 0)} yd</span>
                  <span className="ml-auto"><TierBadge tier={s.tier} /></span></div>
                <p className="mt-1 line-clamp-2 text-muted">{s.desc}</p>
              </button>))}
          </div>
          <p className="mt-2 text-xs text-muted">El nivel (exitosa, neutra o negativa) se mide con lo que necesitaba <b>esta</b> jugada ({num(a.required, 1)} yd). Haz clic para revisarlas.</p>
        </Card>)}
      {p.qb && <div className="flex items-center gap-3 text-sm text-muted"><Headshot url={p.qb.headshot} name={p.qb.name} team={p.qb.team} size="h-8 w-8" />
        ¿Quieres ver cómo reacciona {p.qb.name} en general? <button type="button" className="font-semibold text-accent hover:underline" onClick={() => go(`qbs/${p.qb.id}`)}>Ver su perfil</button></div>}
    </div>
  )
}

