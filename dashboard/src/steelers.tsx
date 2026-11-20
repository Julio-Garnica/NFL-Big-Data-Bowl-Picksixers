import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

// Nuestro equipo. Cada vez que un jugador o el logo de este equipo aparece en pantalla, se celebra.
export const MY_TEAM = 'PIT'
const SHOW_MS = 3500

const Ctx = createContext<() => void>(() => {})

/** Llama a la celebracion cuando se monta un elemento del equipo. */
export function useCheer(team?: string | null) {
  const cheer = useContext(Ctx)
  useEffect(() => { if (team === MY_TEAM) cheer() }, [team, cheer])
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
        <div key={shown} role="status" aria-live="polite"
          className="steelers-pop fixed left-1/2 top-24 z-[90] flex -translate-x-1/2 items-center gap-3 rounded-2xl border-2 border-[#FFB612] bg-[#101820] px-5 py-3 text-[#FFB612] shadow-2xl">
          <img src={`teams/${MY_TEAM}.png`} alt="Steelers" className="steelers-wave h-10 w-10 rounded-full bg-white p-0.5" />
          <span className="text-lg font-black tracking-wide md:text-xl">HERE WE GO STEELERS!!!</span>
          <span className="steelers-wave text-2xl" aria-hidden>ðŸˆ</span>
          <button type="button" onClick={close} aria-label="Cerrar" className="ml-1 rounded-full px-2 text-[#FFB612]/70 hover:text-[#FFB612]">Ã—</button>
        </div>)}
    </Ctx.Provider>
  )
}

