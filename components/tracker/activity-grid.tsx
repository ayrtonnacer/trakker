'use client'

import { useMemo } from 'react'
import { buildActivityGrid } from '@/lib/activity'
import { fmtHours } from '@/lib/game'

const WEEKS = 26
const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** Días trabajados de los últimos meses, como el gráfico de contribuciones de GitHub. */
export function ActivityGrid({ secsByDay, today, liveSecs }: { secsByDay: Map<string, number>; today: string; liveSecs: number }) {
  const grid = useMemo(() => {
    const merged = new Map(secsByDay)
    if (liveSecs > 0) merged.set(today, (merged.get(today) ?? 0) + liveSecs)
    return buildActivityGrid(merged, today, WEEKS)
  }, [secsByDay, today, liveSecs])

  return (
    <div className="activity" role="img" aria-label={`${grid.activeDays} días con actividad en los últimos 6 meses`}>
      <div className="activity-months" style={{ gridTemplateColumns: `repeat(${WEEKS}, minmax(0, 1fr))` }}>
        {grid.months.map((m) => <span key={m.col} style={{ gridColumn: m.col + 1 }}>{m.label}</span>)}
      </div>
      <div className="activity-grid" style={{ gridTemplateColumns: `repeat(${WEEKS}, minmax(0, 1fr))` }}>
        {grid.weeks.map((week) => week.map((c) => {
          const day = Number(c.key.slice(8)), month = MONTHS_LONG[Number(c.key.slice(5, 7)) - 1]
          return <i key={c.key} className={`lv${c.level} ${c.future ? 'future' : ''} ${c.today ? 'today' : ''}`} title={c.future ? undefined : `${day} de ${month} · ${c.secs > 0 ? fmtHours(c.secs) : 'sin actividad'}`} />
        }))}
      </div>
      <div className="activity-foot">
        <span>{grid.activeDays} {grid.activeDays === 1 ? 'día' : 'días'} con actividad en 6 meses</span>
        <span className="activity-legend" aria-hidden="true">Menos <i className="lv0" /><i className="lv1" /><i className="lv2" /><i className="lv3" /><i className="lv4" /> Más</span>
      </div>
    </div>
  )
}
