import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { G } from './glossary'
import { Badge, ChartCard, Headshot, Info, TeamLogo, pct, useChart } from './ui'

export const VERDICTS: Record<string, { label: string; short: string; tone: 'good' | 'accent2' | 'warn' | 'soft' | 'bad'; text: string }> = {
  exitosa: { label: 'La jugada salió bien', short: 'Salió bien', tone: 'good',
    text: 'La jugada fue exitosa. No hay un nivel mejor al cual llegar, así que no se evalúa una alternativa.' },
  coincide: { label: 'El QB eligió lo que recomiendan los datos', short: 'Decisión correcta', tone: 'accent2',
    text: 'La decisión del QB es la misma que recomienda el análisis. Si el resultado fue malo, se debió a la ejecución o a la suerte, no a la elección.' },
  mejor: { label: 'Probablemente habría salido mejor', short: 'Habría salido mejor', tone: 'warn',
    text: 'Con 90 % de confianza, la opción recomendada tenía más de 50 % de probabilidad de dar un mejor resultado que el que ocurrió.' },
  incierto: { label: 'Sin evidencia clara', short: 'Incierto', tone: 'soft',
    text: 'La probabilidad de que la opción recomendada saliera mejor está cerca de 50 %: los datos no permiten afirmar que hubiera mejorado.' },
  no_mejor: { label: 'Cambiar la decisión probablemente no habría ayudado', short: 'No habría mejorado', tone: 'bad',
    text: 'Con 90 % de confianza, la opción recomendada tenía menos de 50 % de probabilidad de mejorar el resultado.' },
}

export const TIERS: Record<number, { label: string; tone: 'good' | 'soft' | 'bad'; info: string }> = {
  2: { label: 'Exitosa', tone: 'good', info: G.exitosa },
  1: { label: 'Neutra', tone: 'soft', info: G.neutra },
  0: { label: 'Negativa', tone: 'bad', info: G.negativa },
}

export const ACTIONS: Record<string, string> = {
  short: 'Pase corto', deep: 'Pase profundo', throwaway: 'Tirar el balón', scramble: 'Correr (scramble)',
  sack: 'Sostuvo el balón (sack)', pass_unknown: 'Pase',
}

export function TierBadge({ tier }: { tier: number }) {
  const t = TIERS[tier]
  return <Badge tone={t.tone}>{t.label}<Info text={t.info} /></Badge>
}

export function VerdictBadge({ v }: { v: string }) {
  const m = VERDICTS[v]
  return <Badge tone={m.tone}>{m.short}<Info text={m.text} /></Badge>
}

/** Barras apiladas exitosa / neutra / negativa por opcion del QB. */
export function OptionTierChart({ options, title, highlight, chosen, height = 220 }: {
  options: any[]; title: string; highlight?: string; chosen?: string; height?: number
}) {
  const { grid, tick, tooltip, legend, tiers } = useChart()
  const data = options.filter(o => o.pS != null).map(o => ({
    name: `${o.label}${o.key === highlight ? ' ★' : ''}${o.key === chosen ? ' (elegida)' : ''}`,
    Exitosa: o.pS, Neutra: Math.max(0, 1 - (o.pS ?? 0) - (o.pNeg ?? 0)), Negativa: o.pNeg,
  }))
  return (
    <ChartCard title={title} info={G.similares}
      howTo={<>Cada barra es una decisión posible del QB y suma 100 %. <b className="text-good">Verde</b> = probabilidad de jugada exitosa,
        gris = neutra, <b className="text-bad">rojo</b> = negativa (sack, INT o pérdida). La mejor opción tiene más verde y menos rojo.
        ★ marca la opción recomendada. Las probabilidades salen de jugadas parecidas en las que el QB eligió esa opción.</>}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ left: 10, right: 10 }}>
          <CartesianGrid {...grid} horizontal={false} />
          <XAxis type="number" domain={[0, 1]} tickFormatter={v => `${Math.round(v * 100)}%`} tick={tick} />
          <YAxis type="category" dataKey="name" width={170} tick={tick} />
          <Tooltip {...tooltip} formatter={(v: any) => pct(v, 0)} />
          <Legend {...legend} />
          <Bar dataKey="Exitosa" stackId="a" fill={tiers.s} />
          <Bar dataKey="Neutra" stackId="a" fill={tiers.n} fillOpacity={0.45} />
          <Bar dataKey="Negativa" stackId="a" fill={tiers.neg} radius={[0, 6, 6, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

/** Persona compacta: foto, nombre y logo del equipo. */
export function PersonChip({ p, sub, onClick }: { p: any; sub?: string; onClick?: () => void }) {
  const El: any = onClick ? 'button' : 'div'
  return (
    <El type={onClick ? 'button' : undefined} onClick={onClick}
      className={`flex items-center gap-3 rounded-xl border border-line bg-soft/50 p-2 pr-3 text-left ${onClick ? 'transition hover:border-accent' : ''}`}>
      <Headshot url={p.headshot} name={p.name} size="h-11 w-11" />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 truncate text-sm font-semibold">{p.name}<TeamLogo abbr={p.team} size="h-4 w-4" /></div>
        <div className="truncate text-xs text-muted">{[p.position, sub].filter(Boolean).join(' · ')}</div>
      </div>
    </El>
  )
}

/** Intervalo de confianza dibujado sobre una escala de 0 a 100 % con la linea de 50 %. */
export function CiBar({ p, ci }: { p: number | null; ci: (number | null)[] }) {
  if (p == null) return <span className="text-muted">–</span>
  const lo = ci[0] ?? p, hi = ci[1] ?? p
  const above = lo > 0.5, below = hi < 0.5
  const color = above ? 'bg-warn' : below ? 'bg-bad' : 'bg-muted'
  return (
    <div className="w-full">
      <div className="relative h-3 rounded-full bg-soft">
        <div className="absolute top-0 h-full w-px bg-fg/50" style={{ left: '50%' }} />
        <div className={`absolute top-0 h-full rounded-full ${color} opacity-40`} style={{ left: `${lo * 100}%`, width: `${Math.max(1, (hi - lo) * 100)}%` }} />
        <div className={`absolute -top-0.5 h-4 w-1.5 rounded ${color}`} style={{ left: `calc(${p * 100}% - 3px)` }} />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted"><span>0%</span><span>50%</span><span>100%</span></div>
    </div>
  )
}
