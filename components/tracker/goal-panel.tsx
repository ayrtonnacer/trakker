'use client'

import { useMemo, useState } from 'react'
import { Carrot, Check, ChevronDown, Plus, Target, X } from 'lucide-react'
import {
  addMonths,
  fmtShort,
  goalTarget,
  milestonesFor,
  monthEarnings,
  monthKey,
  parseAmount,
  suggestedBaseline,
  type Goal,
  type Payment,
  type Task,
} from '@/lib/game'

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

type Props = {
  goal: Goal | null
  setGoal: (g: Goal | null) => void
  tasks: Task[]
  payments: Payment[]
  today: string
}

type GoalDraft = { baseline: string; pct: string; months: string; start: string; milestones: string; custom: boolean }

function monthLabel(m: string) {
  const [y, mm] = m.split('-').map(Number)
  return `${MONTHS[mm - 1]} ${y}`
}

/** Meta de ingresos, siempre la del mes en curso (no cambia con el período de las estadísticas): el objetivo de cada mes y sus micro objetivos (la zanahoria de Inicio). */
export function GoalPanel({ goal, setGoal, tasks, payments, today }: Props) {
  const thisMonth = today.slice(0, 7)
  const [draft, setDraft] = useState<GoalDraft | null>(null)
  const [open, setOpen] = useState(true)
  const suggested = useMemo(() => suggestedBaseline(thisMonth, tasks, payments), [thisMonth, tasks, payments])

  function openDraft() {
    setDraft(goal
      ? { baseline: String(goal.baseline), pct: String(goal.pct), months: String(goal.months), start: goal.start, milestones: goal.milestones.join(', '), custom: goal.milestones.length > 0 }
      : { baseline: suggested ? String(suggested) : '', pct: '20', months: '3', start: thisMonth, milestones: '', custom: false })
  }

  function saveDraft() {
    if (!draft) return
    const baseline = parseAmount(draft.baseline)
    if (baseline <= 0) return
    setGoal({
      baseline,
      pct: Math.max(1, Number(draft.pct) || 0),
      months: Math.max(1, Math.round(Number(draft.months) || 1)),
      start: draft.start || thisMonth,
      milestones: !draft.custom ? [] : draft.milestones.split(/[,;\s]+/).map(parseAmount).filter((n) => n > 0),
      actions: goal?.actions ?? [],
    })
    setDraft(null)
  }

  // ---- meta ----
  const months = goal ? Array.from({ length: goal.months + 1 }, (_, i) => addMonths(goal.start, i - 1)) : []
  const finalTarget = goal ? Math.round(goal.baseline * (1 + goal.pct / 100)) : 0
  const target = goalTarget(goal, thisMonth)
  const earned = monthEarnings(thisMonth, tasks, payments)
  const pct = target > 0 ? Math.min(100, Math.round((earned / target) * 100)) : 0
  const steps = milestonesFor(goal, target)
  const previewTarget = draft ? Math.round(parseAmount(draft.baseline) * (1 + ((Number(draft.pct) || 0) / 100) / Math.max(1, Math.round(Number(draft.months) || 1)))) : 0
  const maxMonth = Math.max(finalTarget, ...months.map((m) => monthEarnings(m, tasks, payments)), 1)

  return (
    <>
        <article className={`panel goal-panel ${open ? 'is-open' : ''}`} id="meta">
          {!goal ? (
            <div className="goal-compact">
              <span className="goal-compact-title"><Target /> Meta de ingresos</span>
              <span className="goal-compact-hint">Ej.: “Aumentar mis ingresos un 20% en 3 meses”.{suggested ? ` Tu base sería US$ ${fmtShort(suggested)}/mes.` : ''}</span>
              <button className="primary-button" onClick={openDraft}><Plus /> Definir meta</button>
            </div>
          ) : (
            <>
              <button className="goal-compact" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
                <span className="goal-compact-title"><Target /> Meta de {MONTHS_LONG[Number(thisMonth.slice(5, 7)) - 1]}</span>
                {target > 0 ? (
                  <>
                    <strong className="goal-compact-pct">{pct}%</strong>
                    <span className="thin-track big goal-compact-track"><span style={{ width: `${pct}%` }} />{steps.map((m) => <i key={m} className={`track-mark ${earned >= m ? 'done' : ''}`} style={{ left: `${(m / target) * 100}%` }} />)}</span>
                    <span className="goal-compact-amount">US$ {fmtShort(Math.round(earned))} <small>de {fmtShort(target)}</small></span>
                  </>
                ) : <span className="goal-compact-hint">Sin objetivo para este mes · {monthLabel(goal.start)} → {monthLabel(addMonths(goal.start, goal.months - 1))}</span>}
                <ChevronDown className="goal-chevron" />
              </button>
              {open && (
                <div className="goal-detail">
                  <div className="goal-detail-top">
                    <p className="goal-sentence">Pasar de <b>US$ {fmtShort(goal.baseline)}</b> a <b>US$ {fmtShort(finalTarget)}</b> por mes (+{goal.pct}%) para {monthLabel(addMonths(goal.start, goal.months - 1))}.</p>
                    <button className="text-button" onClick={openDraft}>Editar</button>
                  </div>
                  {target > 0 && <div className="goal-steps">{steps.map((m) => <span key={m} className={earned >= m ? 'done' : ''}>{earned >= m ? <Check /> : <Carrot />} {fmtShort(m)}</span>)}</div>}
                  <div className="month-bars">
                    {months.map((m, i) => {
                      const actual = monthEarnings(m, tasks, payments)
                      const t = i === 0 ? goal.baseline : goalTarget(goal, m)
                      return (
                        <div key={m} className={`month-bar ${m === thisMonth ? 'is-current' : ''}`} title={`${monthLabel(m)}: US$ ${fmtShort(Math.round(actual))}${i === 0 ? ' (mes anterior al plan)' : ` · objetivo ${fmtShort(t)}`}`}>
                          <div className="month-bar-area">
                            <i className="month-target" style={{ bottom: `${(t / maxMonth) * 100}%` }} />
                            <div className={`month-fill ${actual >= t && i > 0 ? 'hit' : ''}`} style={{ height: `${(actual / maxMonth) * 100}%` }} />
                          </div>
                          <span>{monthLabel(m)}</span>
                          <small>{i === 0 ? 'base' : `${fmtShort(t)}`}</small>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </article>

      {draft && (
        <div className="modal-backdrop" onClick={() => setDraft(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setDraft(null)} aria-label="Cerrar"><X /></button>
            <h2>Meta de ingresos</h2>
            <p>Quiero aumentar mis ingresos un <b>{draft.pct || 0}%</b> en <b>{draft.months || 1}</b> mes{draft.months === '1' ? '' : 'es'}.</p>
            <div className="form-grid">
              <label>Ingreso mensual actual (base)<span className="rate-input"><span>US$</span><input autoFocus inputMode="decimal" value={draft.baseline} onChange={(e) => setDraft({ ...draft, baseline: e.target.value })} placeholder="1000" /><span>/mes</span></span>
                {suggested > 0 && <small className="field-help">Tu promedio de los últimos 3 meses es US$ {fmtShort(suggested)}. <button type="button" className="text-button" onClick={() => setDraft({ ...draft, baseline: String(suggested) })}>Usar</button></small>}
              </label>
              <div className="modal-fields three">
                <label>Aumento %<input inputMode="decimal" value={draft.pct} onChange={(e) => setDraft({ ...draft, pct: e.target.value })} /></label>
                <label>En meses<input inputMode="numeric" value={draft.months} onChange={(e) => setDraft({ ...draft, months: e.target.value })} /></label>
                <label>Desde<input type="month" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} /></label>
              </div>
              <div className="field">
                <span>Micro objetivos de cada mes</span>
                {!draft.custom ? (
                  <small className="field-help">Ya vienen puestos: 25%, 50% y 75% de la meta de cada mes{previewTarget > 0 ? <> (el primer mes: <b>US$ {fmtShort(Math.round(previewTarget * 0.25))}, {fmtShort(Math.round(previewTarget * 0.5))} y {fmtShort(Math.round(previewTarget * 0.75))}</b>)</> : ''}. <button type="button" className="text-button" onClick={() => setDraft({ ...draft, custom: true })}>Personalizar</button></small>
                ) : (
                  <>
                    <input value={draft.milestones} onChange={(e) => setDraft({ ...draft, milestones: e.target.value })} placeholder="Ej. 300, 600, 900" />
                    <small className="field-help">Separados por coma. <button type="button" className="text-button" onClick={() => setDraft({ ...draft, custom: false, milestones: '' })}>Volver a 25 / 50 / 75%</button></small>
                  </>
                )}
              </div>
              {parseAmount(draft.baseline) > 0 && <small className="field-help">Meta final: US$ {fmtShort(Math.round(parseAmount(draft.baseline) * (1 + (Number(draft.pct) || 0) / 100)))} por mes en {monthLabel(addMonths(draft.start || monthKey(), Math.max(1, Number(draft.months) || 1) - 1))}.</small>}
            </div>
            <div className="modal-actions">
              {goal && <button className="ghost-button danger-text" onClick={() => { if (window.confirm('¿Borrar la meta y sus acciones?')) { setGoal(null); setDraft(null) } }}>Borrar meta</button>}
              <button className="ghost-button" onClick={() => setDraft(null)}>Cancelar</button>
              <button className="primary-button" onClick={saveDraft} disabled={parseAmount(draft.baseline) <= 0}>Guardar meta</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
