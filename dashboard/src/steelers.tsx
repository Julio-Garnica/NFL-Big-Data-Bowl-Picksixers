import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

// Nuestro equipo. Cada vez que un jugador o el logo de este equipo aparece en pantalla, se celebra.
export const MY_TEAM = 'PIT'
const SHOW_MS = 3500
// Caracteres no ASCII escritos como escapes para que no se dañen con cambios de codificación.
const FOOTBALL = '\u{1F3C8}'
const CLOSE = '\u00D7'

const Ctx = createContext<() => void>(() => {})

/** Perfil abierto: celebra una vez cuando el perfil seleccionado es de nuestro equipo. */
export function useCheer(team?: string | null) {
  const cheer = useContext(Ctx)
  useEffect(() => { if (team === MY_TEAM) cheer() }, [team, cheer])
}

/** Selector: devuelve una funcion para celebrar cuando el usuario elige a nuestro equipo o a uno de sus jugadores. */
export function useCheerOnSelect() {
  const cheer = useContext(Ctx)
  return (team?: string | null) => { if (team === MY_TEAM) cheer() }
}

export function SteelersProvider({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState(0)        // cambia la "key" para reiniciar la animacion
  const [visible, setVisible] = useState(false)
  const timer = useRef<number>()
  const visibleRef = useRef(false)

  const cheer = useCallback(() => {
    // Varios elementos del equipo al mismo tiempo generan un solo mensaje.
    if (visibleRef.current) return
    visibleRef.current = true
    setVisible(true)
    setShown(n => n + 1)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => { visibleRef.current = false; setVisible(false) }, SHOW_MS)
  }, [])
  const close = () => { window.clearTimeout(timer.current); visibleRef.current = false; setVisible(false) }

  return (
    <Ctx.Provider value={cheer}>
      {children}
      {visible && (
        <div className="pointer-events-none fixed inset-x-0 top-24 z-[90] flex justify-center px-4">
        <div key={shown} role="status" aria-live="polite"
          className="steelers-pop pointer-events-auto flex items-center gap-3 rounded-2xl border-2 border-[#FFB612] bg-[#101820] px-5 py-3 text-[#FFB612] shadow-2xl">
          <img src={`teams/${MY_TEAM}.png`} alt="Steelers" className="steelers-wave h-10 w-10 rounded-full bg-white p-0.5" />
          <span className="whitespace-nowrap text-lg font-black tracking-wide md:text-xl">HERE WE GO STEELERS!!!</span>
          <span className="steelers-wave inline-block text-2xl" aria-hidden>{FOOTBALL}</span>
          <button type="button" onClick={close} aria-label="Cerrar"
            className="ml-1 flex h-7 w-7 items-center justify-center rounded-full text-xl leading-none text-[#FFB612]/70 hover:bg-[#FFB612]/10 hover:text-[#FFB612]">{CLOSE}</button>
        </div>
        </div>)}
    </Ctx.Provider>
  )
}
