import { useCallback, useEffect, useRef, useState } from 'react'
import { MY_TEAM, setTourActive } from './steelers'
import { Icon, TeamLogo, getJson } from './ui'

/*
 * Tour narrado de 45 s: el head coach de los Steelers recorre la app, revisa una jugada real
 * y responde la pregunta principal. Voz: Web Speech API del navegador (sin dependencias).
 * Los navegadores exigen un clic antes de reproducir voz, por eso el tour empieza con un boton.
 */

const MAX_S = 45
const TOUR_QB = 28963                     // Ben Roethlisberger
const TOUR_PLAY = [2021100312, 1019]       // 3.er y 6 vs. Green Bay: sack y fumble
const SEEN_KEY = 'picksixers-tour-visto'
const DOWNS = ['', 'primero', 'segundo', 'tercero', 'cuarto']
const SPOT: Record<string, string> = {
  '1.º y 2.º down': 'primero y segundo down', '3.º corto (≤4 yd)': 'tercero y corto',
  '3.º medio (5-7 yd)': 'tercero y medio', '3.º largo (≥8 yd)': 'tercero y largo',
}
const ACTION: Record<string, string> = {
  short: 'lanzó un pase corto', deep: 'lanzó un pase profundo', throwaway: 'tiró el balón',
  scramble: 'corrió con el balón', sack: 'se quedó con el balón: sack',
}
const REC: Record<string, string> = { short: 'un pase corto', deep: 'un pase profundo', throwaway: 'tirar el balón', scramble: 'correr' }

type Step = { route: string; target?: string; text: string; cheer?: boolean }

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const P = (v: number | null | undefined) => `${Math.round((v ?? 0) * 100)} %`
/** Texto para la voz: sin simbolos que el sintetizador lea mal. */
const speakable = (s: string) => s.replace(/(\d+)\s?%/g, '$1 por ciento').replace(/\bQB\b/g, 'quarterback').replace(/–/g, ' a ')

async function buildSteps(): Promise<Step[]> {
  const [off, qb, rv] = await Promise.all([
    getJson(`api/offense/${MY_TEAM}`), getJson(`api/qb/${TOUR_QB}`), getJson(`api/review/${TOUR_PLAY[0]}/${TOUR_PLAY[1]}`)])
  const spot = [...off.byContext].filter((c: any) => c.n >= 10).sort((a: any, b: any) => b.pressureRate - a.pressureRate)[0]
  const p = rv.play, a = rv.analysis
  // Primero quien hizo el sack, si lo hubo.
  const presser = (p.pressers?.find((x: any) => x.kinds.includes('sack')) ?? p.pressers?.[0])?.name
  const fumble = /FUMBLES/i.test(p.desc) ? ' y fumble' : ''
  const first = qb.name.split(' ')[0]
  return [
    { route: 'inicio', target: 'h1',
      text: `Soy el head coach de los Steelers. Bajo presión, ¿mi QB tomó la mejor decisión? ¿Pudo salir mejor la jugada?` },
    { route: `ofensivas/${MY_TEAM}`,
      text: `Mi línea permite presión en el ${P(off.pressureRate)} de los dropbacks; en ${SPOT[spot.label] ?? spot.label}, en el ${P(spot.pressureRate)}.` },
    { route: `qbs/${TOUR_QB}`,
      text: `Con presión, ${qb.name} solo tiene ${P(qb.pressure.successRate)} de jugadas exitosas; la liga, ${P(qb.league.pressure.successRate)}.` },
    { route: `revision/${TOUR_PLAY[0]}/${TOUR_PLAY[1]}`, target: '#tour-jugada',
      text: `Esta jugada contra ${p.defense.nick}: ${DOWNS[p.down]} y ${p.ytg}${presser ? `, presión de ${presser}` : ''}. ${first} ${ACTION[p.action] ?? 'decidió'}${fumble}.` },
    { route: `revision/${TOUR_PLAY[0]}/${TOUR_PLAY[1]}`, target: '#tour-datos',
      text: `En jugadas parecidas con presión, ${REC[a.rec]} sale mejor mucho más seguido.` },
    { route: `revision/${TOUR_PLAY[0]}/${TOUR_PLAY[1]}`, target: '#tour-veredicto',
      text: `Respuesta: no fue la mejor decisión. ${cap(REC[a.rec])} tenía ${P(a.pBetter)} de probabilidad de salir mejor, con 90 % de confianza.` },
    { route: `revision/${TOUR_PLAY[0]}/${TOUR_PLAY[1]}`, target: '#tour-veredicto', cheer: true,
      text: `Esa jugada va a la junta con ${first}. ¡Here we go, Steelers!` },
  ]
}

function pickVoice(): SpeechSynthesisVoice | null {
  const vs = window.speechSynthesis?.getVoices() ?? []
  const es = vs.filter(v => v.lang?.toLowerCase().startsWith('es'))
  const score = (v: SpeechSynthesisVoice) =>
    (v.lang.toLowerCase() === 'es-mx' ? 4 : v.lang.toLowerCase() === 'es-us' ? 3 : 1) + (/natural|online/i.test(v.name) ? 2 : 0) + (/jorge|ra[uú]l|pablo|alvaro|male/i.test(v.name) ? 1 : 0)
  return es.sort((a, b) => score(b) - score(a))[0] ?? null
}

export function shouldAutostartTour() {
  return !sessionStorage.getItem(SEEN_KEY)
}

export default function Tour({ go, onClose, autostart }: { go: (p: string) => void; onClose: () => void; autostart: boolean }) {
  const [phase, setPhase] = useState<'intro' | 'playing' | 'end'>(autostart ? 'intro' : 'playing')
  const [steps, setSteps] = useState<Step[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [idx, setIdx] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [paused, setPaused] = useState(false)
  const [muted, setMuted] = useState(!('speechSynthesis' in window))
  const run = useRef({ token: 0, paused: false, muted: !('speechSynthesis' in window), elapsed: 0 })
  const hasVoice = 'speechSynthesis' in window

  useEffect(() => { sessionStorage.setItem(SEEN_KEY, '1') }, [])
  useEffect(() => { buildSteps().then(setSteps).catch(e => setErr(String(e.message || e))) }, [])
  useEffect(() => { window.speechSynthesis?.getVoices() }, [])   // precarga de voces

  const stop = useCallback(() => {
    setTourActive(false)
    run.current.token++
    window.speechSynthesis?.cancel()
    document.querySelectorAll('.tour-focus').forEach(el => el.classList.remove('tour-focus'))
  }, [])
  useEffect(() => stop, [stop])

  // Reloj del tour: avanza solo mientras no esta en pausa; se corta a los 45 s.
  useEffect(() => {
    if (phase !== 'playing') return
    let last = performance.now(), raf = 0
    const tick = (now: number) => {
      if (!run.current.paused) run.current.elapsed += (now - last) / 1000
      last = now
      setElapsed(run.current.elapsed)
      if (run.current.elapsed >= MAX_S) { finish(); return }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [phase])

  const finish = () => { stop(); setPhase('end') }

  /** Espera ms de tiempo "activo" (no cuenta la pausa). */
  const wait = (ms: number, token: number) => new Promise<void>(res => {
    let left = ms, last = performance.now()
    const f = () => {
      if (run.current.token !== token) return res()
      const now = performance.now()
      if (!run.current.paused) left -= now - last
      last = now
      left <= 0 ? res() : setTimeout(f, 50)
    }
    f()
  })

  const say = (text: string, token: number) => new Promise<void>(res => {
    const est = Math.max(2500, (speakable(text).split(/\s+/).length / 3.2) * 1000)
    if (run.current.muted || !hasVoice) return wait(est, token).then(res)
    const u = new SpeechSynthesisUtterance(speakable(text))
    const v = pickVoice()
    if (v) u.voice = v
    u.lang = v?.lang ?? 'es-MX'
    u.rate = 1.15
    let done = false
    const t0 = performance.now()
    const end = () => { if (!done) { done = true; res() } }
    // Si la voz termina muy pronto (sin audio o error), completamos con el tiempo estimado.
    const finishSpeech = () => {
      const spent = performance.now() - t0
      if (spent < est * 0.45) wait(est - spent, token).then(end); else end()
    }
    u.onend = () => (run.current.muted ? undefined : finishSpeech())
    u.onerror = () => finishSpeech()
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(u)
    // Respaldo: si la voz no termina (o se silencio), seguimos con el tiempo estimado.
    wait(est + 2500, token).then(end)
  })

  const start = async () => {
    if (!steps) return
    stop()
    const token = run.current.token
    setTourActive(true)
    run.current.elapsed = 0
    run.current.paused = false
    setPaused(false)
    setElapsed(0)
    setPhase('playing')
    for (let i = 0; i < steps.length; i++) {
      if (run.current.token !== token) return
      const s = steps[i]
      setIdx(i)
      if (!location.hash.endsWith(s.route)) go(s.route)
      await wait(i === 0 ? 300 : 650, token)
      document.querySelectorAll('.tour-focus').forEach(el => el.classList.remove('tour-focus'))
      if (s.target) {
        const el = document.querySelector(s.target)
        if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('tour-focus') }
      } else window.scrollTo({ top: 0, behavior: 'smooth' })
      if (s.cheer) window.dispatchEvent(new CustomEvent('picksixers-cheer'))
      await say(s.text, token)
    }
    if (run.current.token === token) finish()
  }

  // Si se abre desde el header (no es el arranque), empieza en cuanto haya datos.
  useEffect(() => { if (!autostart && steps && phase === 'playing' && run.current.elapsed === 0) start() }, [steps])

  const togglePause = () => {
    run.current.paused = !run.current.paused
    setPaused(run.current.paused)
    if (run.current.paused) window.speechSynthesis?.pause(); else window.speechSynthesis?.resume()
  }
  const toggleMute = () => {
    run.current.muted = !run.current.muted
    setMuted(run.current.muted)
    if (run.current.muted) window.speechSynthesis?.cancel()
  }
  const close = () => { stop(); onClose() }
  const mmss = (s: number) => `0:${String(Math.floor(s)).padStart(2, '0')}`

  // ---------------------------------------------------------------- pantalla de inicio
  if (phase === 'intro') return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="fade-in w-full max-w-lg overflow-hidden rounded-3xl border-2 border-[#FFB612] bg-[#101820] text-white shadow-2xl">
        <div className="flex items-center gap-4 bg-gradient-to-r from-black to-[#3a2c00] p-6">
          <span className="rounded-full bg-white p-1"><TeamLogo abbr={MY_TEAM} size="h-14 w-14" /></span>
          <div><div className="text-xs font-semibold uppercase tracking-widest text-[#FFB612]">Tour de 45 segundos</div>
            <h2 className="text-2xl font-extrabold leading-tight">Un día con el head coach de los Steelers</h2></div>
        </div>
        <div className="space-y-3 p-6 text-sm text-white/80">
          <p>El head coach recorre la app con voz, revisa una jugada real de Ben Roethlisberger y responde la pregunta: <b className="text-white">¿tomó la mejor decisión bajo presión?</b></p>
          {!hasVoice && <p className="text-[#FFB612]">Tu navegador no tiene voz sintetizada: verás el tour con subtítulos.</p>}
          {err && <p className="text-red-300">No se pudo preparar el tour: {err}</p>}
          <div className="flex flex-wrap gap-3 pt-2">
            <button type="button" disabled={!steps} onClick={start}
              className="inline-flex items-center gap-2 rounded-xl bg-[#FFB612] px-5 py-2.5 font-bold text-black shadow transition hover:brightness-110 disabled:opacity-50">
              ▶ {steps ? 'Reproducir el tour' : 'Preparando…'}</button>
            <button type="button" onClick={close} className="rounded-xl border border-white/30 px-5 py-2.5 font-semibold hover:bg-white/10">Ahora no</button>
          </div>
          <p className="text-xs text-white/50">Puedes repetirlo cuando quieras con el botón "Tour" del header.</p>
        </div>
      </div>
    </div>)

  // ---------------------------------------------------------------- reproductor
  const s = steps?.[idx]
  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-[80] shadow-[inset_0_0_120px_rgba(0,0,0,0.65)]" />
      <div className="fixed inset-x-0 bottom-0 z-[95] px-3 pb-3">
        <div className="fade-in mx-auto max-w-4xl overflow-hidden rounded-2xl border-2 border-[#FFB612] bg-[#101820]/95 text-white shadow-2xl backdrop-blur">
          <div className="h-1.5 bg-white/10"><div className="h-full bg-[#FFB612] transition-[width] duration-200" style={{ width: `${Math.min(100, (elapsed / MAX_S) * 100)}%` }} /></div>
          {phase === 'end' ? (
            <div className="flex flex-wrap items-center gap-4 p-4">
              <span className="rounded-full bg-white p-0.5"><TeamLogo abbr={MY_TEAM} size="h-10 w-10" /></span>
              <div className="min-w-0 flex-1"><b className="text-[#FFB612]">Fin del tour.</b> <span className="text-sm text-white/80">Explora la jugada en pantalla o revisa otras desde Revisión de jugadas.</span></div>
              <button type="button" onClick={start} className="rounded-xl bg-[#FFB612] px-4 py-2 text-sm font-bold text-black hover:brightness-110">↻ Repetir</button>
              <button type="button" onClick={close} className="rounded-xl border border-white/30 px-4 py-2 text-sm font-semibold hover:bg-white/10">Cerrar</button>
            </div>
          ) : (
            <div className="flex items-center gap-4 p-4">
              <div className="hidden shrink-0 flex-col items-center sm:flex">
                <span className="rounded-full bg-white p-0.5"><TeamLogo abbr={MY_TEAM} size="h-11 w-11" /></span>
                <span className="mt-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#FFB612]">
                  <span className={`h-1.5 w-1.5 rounded-full bg-red-500 ${paused ? '' : 'animate-pulse'}`} /> Head coach</span>
              </div>
              <p key={idx} className="fade-in min-w-0 flex-1 text-base font-medium leading-snug md:text-lg">{s?.text ?? 'Preparando…'}</p>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <span className="font-mono text-xs text-white/60">{mmss(elapsed)} / {mmss(MAX_S)}</span>
                <div className="flex gap-1">
                  <button type="button" onClick={togglePause} aria-label={paused ? 'Continuar' : 'Pausa'} title={paused ? 'Continuar' : 'Pausa'}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20">{paused ? '▶' : '❚❚'}</button>
                  {hasVoice && <button type="button" onClick={toggleMute} aria-label={muted ? 'Activar voz' : 'Silenciar'} title={muted ? 'Activar voz' : 'Silenciar'}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-sm hover:bg-white/20">{muted ? '🔇' : '🔊'}</button>}
                  <button type="button" onClick={close} aria-label="Cerrar tour" title="Cerrar tour"
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20">✕</button>
                </div>
              </div>
            </div>)}
          <div className="flex gap-1 px-4 pb-2">{(steps ?? []).map((_, i) => (
            <span key={i} className={`h-1 flex-1 rounded-full ${i < idx || phase === 'end' ? 'bg-[#FFB612]' : i === idx ? 'bg-[#FFB612]/60' : 'bg-white/15'}`} />))}</div>
        </div>
      </div>
    </>
  )
}

export function TourButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} title="Ver el tour de 45 segundos"
      className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#FFB612]/60 bg-[#FFB612]/10 px-2.5 py-1.5 text-sm font-semibold text-fg transition hover:bg-[#FFB612]/20">
      <Icon name="play" className="h-4 w-4 text-[#FFB612]" /> Tour
    </button>
  )
}
