import { useMemo, useState } from 'react'
import { G } from './glossary'
import { Badge, Card, Field, Headshot, Info, Loading, Segmented, TeamLogo, selectCls, useApi } from './ui'

const PAGE = 24
const GROUPS: Record<string, string[]> = {
  QB: ['QB'], RB: ['RB', 'FB'], WR: ['WR'], TE: ['TE'], OL: ['T', 'G', 'C'],
  DL: ['DE', 'DT', 'NT'], LB: ['OLB', 'ILB', 'MLB', 'LB'], DB: ['CB', 'FS', 'SS', 'DB'],
}
const groupOf = (pos: string) => Object.keys(GROUPS).find(g => GROUPS[g].includes(pos)) ?? 'Otro'
type Sort = 'snaps' | 'name' | 'weight' | 'height'

export default function Players({ go }: { go: (p: string) => void }) {
  const { data, error } = useApi<any[]>('api/players')
  const [q, setQ] = useState('')
  const [group, setGroup] = useState('Todos')
  const [team, setTeam] = useState('')
  const [sort, setSort] = useState<Sort>('snaps')
  const [shown, setShown] = useState(PAGE)
  const teams = useMemo(() => [...new Set((data ?? []).map(p => p.team).filter(Boolean))].sort() as string[], [data])
  const list = useMemo(() => {
    const t = q.trim().toLowerCase()
    const h = (p: any) => (p.heightFt ?? 0) * 12 + (p.heightIn ?? 0)
    return (data ?? []).filter(p => (group === 'Todos' || groupOf(p.position) === group) && (!team || p.team === team) &&
      (!t || p.name.toLowerCase().includes(t) || (p.college ?? '').toLowerCase().includes(t)))
      .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'weight' ? (b.weightLb ?? 0) - (a.weightLb ?? 0)
        : sort === 'height' ? h(b) - h(a) : b.snaps - a.snaps)
  }, [data, q, group, team, sort])
  const reset = () => setShown(PAGE)

  if (!data) return <Loading error={error} />
  return (
    <div className="space-y-4">
      <Card>
        <div className="grid gap-3 md:grid-cols-[1fr_180px_160px]">
          <Field label="Buscar por nombre o universidad">
            <input type="search" value={q} onChange={e => { setQ(e.target.value); reset() }} placeholder="Ej. Mahomes, Alabama…" className={selectCls} /></Field>
          <Field label="Equipo">
            <select className={selectCls} value={team} onChange={e => { setTeam(e.target.value); reset() }}>
              <option value="">Todos</option>{teams.map(t => <option key={t}>{t}</option>)}</select></Field>
          <Field label="Ordenar por">
            <select className={selectCls} value={sort} onChange={e => setSort(e.target.value as Sort)}>
              <option value="snaps">Más jugadas</option><option value="name">Nombre</option><option value="weight">Peso</option><option value="height">Estatura</option></select></Field>
        </div>
        <div className="mt-3"><Segmented value={group} onChange={g => { setGroup(g); reset() }} options={['Todos', ...Object.keys(GROUPS)].map(v => ({ v, label: v }))} /></div>
      </Card>
      <p className="flex items-center text-sm text-muted">{list.length} jugadores. Estatura en pies y pulgadas, peso en libras.
        <Info text={`Jugadas = dropbacks en los que participó (como pasador, receptor, bloqueador, rusher o en cobertura). ${G.dropback}`} /></p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {list.slice(0, shown).map(p => {
          const link = p.hasQbProfile ? `qbs/${p.id}` : p.hasDefProfile && p.team ? `defensas/${p.team}/${p.id}` : null
          return (
            <article key={p.id} className="fade-in flex gap-4 rounded-2xl border border-line bg-surface p-4 shadow-card">
              <Headshot url={p.headshot} name={p.name} team={p.team} size="h-20 w-20" />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="truncate font-semibold leading-tight">{p.name}</h4><Badge tone="accent">{p.position}</Badge></div>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-muted"><TeamLogo abbr={p.team} size="h-4 w-4" />{p.team ?? 'Sin equipo'}{p.college ? ` · ${p.college}` : ''}</p>
                <dl className="mt-2 grid grid-cols-4 gap-2 text-xs">
                  <div><dt className="text-muted">Estatura</dt><dd className="font-semibold">{p.heightFt != null ? `${p.heightFt}' ${p.heightIn}"` : '–'}</dd></div>
                  <div><dt className="text-muted">Peso</dt><dd className="font-semibold">{p.weightLb != null ? `${p.weightLb} lb` : '–'}</dd></div>
                  <div><dt className="text-muted">Edad</dt><dd className="font-semibold">{p.age ?? '–'}</dd></div>
                  <div><dt className="text-muted">Jugadas</dt><dd className="font-semibold">{p.snaps}</dd></div>
                </dl>
                {link && <button type="button" onClick={() => go(link)} className="mt-2 text-xs font-semibold text-accent hover:underline">Ver perfil →</button>}
              </div>
            </article>)
        })}
      </div>
      {shown < list.length && (
        <div className="text-center"><button type="button" onClick={() => setShown(s => s + PAGE)}
          className="rounded-xl bg-accent px-5 py-2 text-sm font-semibold text-onaccent hover:opacity-90">Mostrar más</button></div>)}
    </div>
  )
}

