import { useEffect, useMemo, useRef, useState } from 'react'
import { G } from './glossary'
import { ChartCard, Headshot, Info, Loading, Segmented, num, useApi } from './ui'

/*
 * Desarrollo de la jugada con el tracking (10 cuadros por segundo).
 * La ofensiva siempre ataca hacia la derecha. Unidades del SVG = yardas.
 */

const ROLE: Record<string, string> = {
  Pass: 'QB', 'Pass Rush': 'Rusher', 'Pass Block': 'Bloqueador', 'Pass Route': 'Ruta', Coverage: 'Cobertura',
}
const EVENT: Record<string, string> = {
  ball_snap: 'Snap', pass_forward: 'Pase', qb_sack: 'Sack', qb_strip_sack: 'Sack y fumble', run: 'Corre',
  fumble: 'Fumble', play_action: 'Play action', pass_arrived: 'Llega el pase', pass_outcome_caught: 'Atrapado',
  pass_outcome_incomplete: 'Incompleto', pass_outcome_interception: 'Intercepción', qb_spike: 'Spike',
}
const W = 53.3

export default function PlayField({ gameId, playId }: { gameId: number; playId: number }) {
  const { data: d, error } = useApi(`api/tracking/${gameId}/${playId}`)
  const [frame, setFrame] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [sel, setSel] = useState<number | null>(null)
  const raf = useRef(0)

  // Reproduccion
  useEffect(() => {
    if (!playing || !d) return
    let last = performance.now(), acc = 0
    const tick = (now: number) => {
      acc += ((now - last) / 1000) * d.fps * speed
      last = now
      if (acc >= 1) {
        const step = Math.floor(acc)
        acc -= step
        setFrame(f => {
          const n = Math.min(d.frames - 1, f + step)
          if (n >= d.frames - 1) setPlaying(false)
          return n
        })
      }
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [playing, speed, d])

  // Recorte del campo: zona donde se movieron los jugadores
  const view = useMemo(() => {
    if (!d) return null
    let lo = Infinity, hi = -Infinity, top = Infinity, bot = -Infinity
    for (const path of d.positions) for (const p of path) if (p[0] != null) {
      lo = Math.min(lo, p[0]); hi = Math.max(hi, p[0]); top = Math.min(top, p[1]); bot = Math.max(bot, p[1])
    }
    lo = Math.max(0, Math.min(lo, d.los - 10) - 4)
    hi = Math.min(120, Math.max(hi, d.firstDown) + 4)
    if (hi - lo < 50) { const c = (hi + lo) / 2; lo = Math.max(0, c - 25); hi = Math.min(120, lo + 50) }
    // Alto: zona por donde se movieron los jugadores, con proporcion de pantalla ancha (max. 0.6 del largo).
    const need = bot - top + 6
    const h = Math.min(W + 4, Math.max(26, need, (hi - lo) * 0.45))
    let y0 = Math.max(-2, (top + bot) / 2 - h / 2)
    if (y0 + h > W + 2) y0 = Math.max(-2, W + 2 - h)
    return { lo, hi, y0, h }
  }, [d])

  if (!d || !view) return <Card0><Loading error={error} /></Card0>

  const qbI = d.players.findIndex((p: any) => p.isQb)
  const at = (i: number, f = frame) => d.positions[i][f]
  // Rusher mas cercano al QB en el cuadro actual
  let near: { i: number; dist: number } | null = null
  const qp = qbI >= 0 ? at(qbI) : null
  if (qp && qp[0] != null) d.players.forEach((p: any, i: number) => {
    const pp = at(i)
    if (p.role === 'Pass Rush' && pp[0] != null) {
      const dist = Math.hypot(pp[0] - qp[0], pp[1] - qp[1])
      if (!near || dist < near.dist) near = { i, dist }
    }
  })
  const nearest = near as { i: number; dist: number } | null
  const tSnap = (frame - d.snapIndex) / d.fps
  const lastEvent = [...d.events].reverse().find((e: any) => e.index <= frame && EVENT[e.event])
  const selP = sel != null ? d.players[sel] : null
  const trailIdx = d.players.map((p: any, i: number) => (p.isQb || p.pressed || i === sel ? i : -1)).filter((i: number) => i >= 0)
  const yardNums = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110].filter(x => x > 10 && x < 110)

  return (
    <ChartCard title="Desarrollo de la jugada" info="Posiciones reales de los 22 jugadores y el balón, medidas 10 veces por segundo (tracking de la NFL). La ofensiva siempre ataca hacia la derecha."
      howTo={<>Presiona ▶ para ver la jugada o mueve la barra cuadro por cuadro. Los círculos con número son los jugadores: <b>{d.offense.nick}</b> (ofensiva, círculos de color) y <b>{d.defense.nick}</b> (defensa, círculos blancos).
        El aro dorado es el QB y los aros rojos son los defensores que lo presionaron; sus líneas muestran el camino que recorrieron. La línea azul es la línea de golpeo y la amarilla, la del primer down.
        Mira cómo baja la distancia del rusher más cercano: cuando llega a 1 o 2 yardas, el QB ya no tiene tiempo. Haz clic en un jugador para ver quién es.</>}>
      <div className="relative overflow-hidden rounded-xl border border-line">
        <svg viewBox={`${view.lo} ${view.y0} ${view.hi - view.lo} ${view.h}`} className="block h-auto w-full select-none" style={{ background: '#1d5e33' }}>
          {/* franjas del pasto */}
          {Array.from({ length: 24 }, (_, k) => k * 5).map(x => <rect key={x} x={x} y={0} width={5} height={W} fill={x % 10 === 0 ? '#20683a' : '#1d5e33'} />)}
          <rect x={0} y={0} width={10} height={W} fill="#174d2a" /><rect x={110} y={0} width={10} height={W} fill="#174d2a" />
          {Array.from({ length: 23 }, (_, k) => 10 + k * 5).map(x => <line key={x} x1={x} x2={x} y1={0} y2={W} stroke="#ffffff" strokeOpacity={x % 10 === 0 ? 0.55 : 0.25} strokeWidth={0.15} />)}
          {yardNums.map(x => (
            <g key={x} fill="#fff" fillOpacity={0.45} fontSize={2.2} fontWeight={700} textAnchor="middle">
              <text x={x} y={6}>{x <= 60 ? x - 10 : 110 - x}</text><text x={x} y={W - 4}>{x <= 60 ? x - 10 : 110 - x}</text>
            </g>))}
          <line x1={0} x2={120} y1={0} y2={0} stroke="#fff" strokeWidth={0.3} /><line x1={0} x2={120} y1={W} y2={W} stroke="#fff" strokeWidth={0.3} />
          {/* linea de golpeo y primer down */}
          <line x1={d.los} x2={d.los} y1={0} y2={W} stroke="#3b82f6" strokeWidth={0.45} />
          <line x1={d.firstDown} x2={d.firstDown} y1={0} y2={W} stroke="#facc15" strokeWidth={0.45} />
          {/* caminos recorridos */}
          {trailIdx.map((i: number) => {
            const pts = d.positions[i].slice(d.snapIndex, frame + 1).filter((p: any) => p[0] != null).map((p: any) => `${p[0]},${p[1]}`).join(' ')
            const p = d.players[i]
            return <polyline key={`t${i}`} points={pts} fill="none" stroke={p.isQb ? '#FFB612' : p.pressed ? '#f87171' : '#e2e8f0'} strokeWidth={0.3} strokeOpacity={0.85} strokeDasharray={p.isQb ? '' : '0.8 0.5'} />
          })}
          {/* linea QB - rusher mas cercano */}
          {nearest && qp && (() => { const r = at(nearest.i); return <line x1={qp[0]} y1={qp[1]} x2={r[0]} y2={r[1]} stroke="#f87171" strokeWidth={0.2} strokeDasharray="0.5 0.4" /> })()}
          {/* jugadores */}
          {d.players.map((p: any, i: number) => {
            const pp = at(i)
            if (pp[0] == null) return null
            const off = p.side === 'off'
            const fill = off ? d.offense.color : '#ffffff'
            const stroke = off ? d.offense.color2 : d.defense.color
            const ink = off ? '#ffffff' : d.defense.color
            return (
              <g key={p.id} transform={`translate(${pp[0]} ${pp[1]})`} className="cursor-pointer" onClick={() => setSel(i === sel ? null : i)}>
                <title>{`${p.name ?? ''} #${p.jersey ?? ''} · ${p.position ?? ''} · ${ROLE[p.role] ?? p.role ?? ''}`}</title>
                {p.isQb && <circle r={1.65} fill="none" stroke="#FFB612" strokeWidth={0.35} />}
                {p.pressed && <circle r={1.65} fill="none" stroke="#f87171" strokeWidth={0.35}><animate attributeName="r" values="1.4;1.9;1.4" dur="1.2s" repeatCount="indefinite" /></circle>}
                {i === sel && <circle r={2.1} fill="none" stroke="#fff" strokeWidth={0.25} strokeDasharray="0.6 0.4" />}
                <circle r={1.05} fill={fill} stroke={stroke} strokeWidth={0.28} />
                <text y={0.42} textAnchor="middle" fontSize={1.15} fontWeight={800} fill={ink}>{p.jersey ?? ''}</text>
              </g>)
          })}
          {/* balon */}
          {d.ball[frame]?.[0] != null && <ellipse cx={d.ball[frame][0]} cy={d.ball[frame][1]} rx={0.55} ry={0.35} fill="#8B4513" stroke="#fff" strokeWidth={0.1} />}
        </svg>
        <div className="pointer-events-none absolute left-2 top-2 flex flex-wrap gap-1.5 text-[11px] font-semibold">
          <span className="rounded-md bg-black/60 px-2 py-0.5 text-white">{tSnap < 0 ? `${num(-tSnap)} s antes del snap` : `${num(tSnap)} s desde el snap`}</span>
          {lastEvent && <span className="rounded-md bg-[#FFB612] px-2 py-0.5 text-black">{EVENT[lastEvent.event]}</span>}
        </div>
      </div>

      {/* controles */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => { if (frame >= d.frames - 1) setFrame(0); setPlaying(p => !p) }}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-onaccent shadow" aria-label={playing ? 'Pausa' : 'Reproducir'}>{playing ? '❚❚' : '▶'}</button>
        <button type="button" onClick={() => { setPlaying(false); setFrame(0) }} className="flex h-9 w-9 items-center justify-center rounded-lg bg-soft" aria-label="Reiniciar" title="Reiniciar">↺</button>
        <div className="relative min-w-[200px] flex-1">
          <input type="range" min={0} max={d.frames - 1} value={frame} onChange={e => { setPlaying(false); setFrame(+e.target.value) }} className="w-full" aria-label="Cuadro de la jugada" />
          <div className="pointer-events-none relative h-4">
            {d.events.filter((e: any) => EVENT[e.event] && e.event !== 'autoevent_ballsnap').map((e: any) => (
              <span key={`${e.index}${e.event}`} className="absolute -translate-x-1/2 whitespace-nowrap text-[10px] text-muted" style={{ left: `${(e.index / (d.frames - 1)) * 100}%` }}>▲ {EVENT[e.event]}</span>))}
          </div>
        </div>
        <Segmented value={speed} onChange={setSpeed} options={[{ v: 0.5, label: '0.5×' }, { v: 1, label: '1×' }, { v: 2, label: '2×' }]} />
      </div>

      {/* datos del cuadro y jugador seleccionado */}
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl bg-soft p-3 text-sm">
          <div className="flex items-center text-xs text-muted">Rusher más cerca del QB en este momento<Info text={G.rusherDist} /></div>
          {nearest ? <div className="mt-1"><b className={nearest.dist < 2 ? 'text-bad' : nearest.dist < 4 ? 'text-warn' : 'text-good'}>{num(nearest.dist)} yd</b>
            {' · '}{d.players[nearest.i].name} (#{d.players[nearest.i].jersey})</div> : <div className="mt-1 text-muted">–</div>}
          <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted">
            <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full" style={{ background: d.offense.color, boxShadow: `0 0 0 2px ${d.offense.color2}` }} />{d.offense.nick}</span>
            <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full" style={{ background: '#fff', boxShadow: `0 0 0 2px ${d.defense.color}` }} />{d.defense.nick}</span>
            <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full border-2 border-[#FFB612]" />QB</span>
            <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full border-2 border-[#f87171]" />Presionó al QB</span>
            <span><span className="mr-1 inline-block h-0.5 w-3 bg-[#3b82f6] align-middle" />Línea de golpeo</span>
            <span><span className="mr-1 inline-block h-0.5 w-3 bg-[#facc15] align-middle" />Primer down</span>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl bg-soft p-3 text-sm">
          {selP ? <>
            <Headshot url={selP.headshot} name={selP.name} size="h-12 w-12" />
            <div className="min-w-0"><b>{selP.name}</b> <span className="text-muted">#{selP.jersey} · {selP.position}</span>
              <div className="text-xs text-muted">{selP.side === 'off' ? d.offense.nick : d.defense.nick} · {ROLE[selP.role] ?? selP.role ?? '–'}{selP.spot ? ` (alineado en ${selP.spot})` : ''}
                {selP.pressed ? ' · presionó al QB' : ''}{selP.beaten ? ' · fue vencido en su bloqueo' : ''}</div></div>
          </> : <p className="text-xs text-muted">Haz clic en un jugador del campo para ver quién es y seguir su recorrido.</p>}
        </div>
      </div>
    </ChartCard>
  )
}

function Card0({ children }: { children: React.ReactNode }) {
  return <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">{children}</section>
}
