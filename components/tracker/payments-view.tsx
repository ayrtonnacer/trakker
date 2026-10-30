'use client'

import { useMemo, useState } from 'react'
import { ClipboardPaste, Landmark, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { PAY_METHODS, PERSONAL, clientStatus, dateKey, fmtMoney, paymentClientId, paymentKind, parseAmount, uid, type Client, type Payment, type Project } from '@/lib/game'
import { parsePayments, type ParsedLine } from '@/lib/payments-import'

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const fmtDay = (d: string) => d.split('-').reverse().slice(0, 2).join('/')
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`

/** Cuentas ya usadas primero, después las comunes: así casi nunca hay que escribir. */
function accountOptions(payments: Payment[]) {
  const used = payments.map((p) => p.method).filter((m): m is string => !!m)
  return [...new Set([...used, ...PAY_METHODS.filter((m) => m !== 'Otro')])]
}

/** La cuenta con la que te pagó esa plataforma la última vez, o la que tiene cargada. */
function accountFor(clientId: string, clients: Client[], payments: Payment[]) {
  const last = payments.filter((p) => p.method && p.clientId === clientId).sort((a, b) => b.date.localeCompare(a.date))[0]
  return last?.method ?? clients.find((c) => c.id === clientId)?.payMethod ?? ''
}

/** Plataforma más probable: la activa con pagos más recientes. */
export function defaultClientId(clients: Client[], payments: Payment[]) {
  const recent = [...payments].filter((p) => p.clientId).sort((a, b) => b.date.localeCompare(a.date))[0]?.clientId
  return (recent && clients.some((c) => c.id === recent) ? recent : (clients.find((c) => clientStatus(c) === 'activo') ?? clients[0])?.id) ?? ''
}

type FormDraft = { id?: string; clientId: string; amount: string; date: string; method: string; label: string; bonus: boolean }

type FormProps = {
  clients: Client[]
  projects: Project[]
  payments: Payment[]
  /** Un pago existente para editarlo, o la plataforma y el tipo para uno nuevo. */
  start: Payment | { clientId: string; bonus?: boolean }
  onSave: (p: Payment) => void
  onClose: () => void
}

/** Registrar o corregir un pago: plataforma, monto, fecha y en qué cuenta entró. Nada más. */
export function PaymentForm({ clients, projects, payments, start, onSave, onClose }: FormProps) {
  const editing = 'id' in start ? start : null
  const [draft, setDraft] = useState<FormDraft>(() => editing
    ? { id: editing.id, clientId: editing.clientId ?? '', amount: String(editing.amount).replace('.', ','), date: editing.date, method: editing.method ?? '', label: editing.label, bonus: paymentKind(editing) === 'bonus' }
    : { clientId: (start as { clientId: string }).clientId, amount: '', date: dateKey(), method: accountFor((start as { clientId: string }).clientId, clients, payments), label: '', bonus: !!(start as { bonus?: boolean }).bonus })
  const [error, setError] = useState('')
  const project = editing?.projectId ? projects.find((p) => p.id === editing.projectId) : null

  function save() {
    const amount = parseAmount(draft.amount)
    if (!project && !draft.clientId) return setError('Elegí la plataforma que te pagó.')
    if (amount <= 0) return setError('Poné el monto que te llegó.')
    const client = clients.find((c) => c.id === draft.clientId)
    const kind = project ? paymentKind(editing!) : draft.bonus ? 'bonus' : 'payout'
    const label = draft.label.trim() || (project ? 'Cobro' : draft.bonus ? 'Bonus' : `Pago ${client?.name ?? ''}`.trim())
    const base: Payment = editing ? { ...editing } : { id: uid(), projectId: null, label, amount, date: dateKey(), paid: true }
    const next: Payment = { ...base, label, amount, date: draft.date || dateKey(), kind, ...(project ? {} : { clientId: draft.clientId }) }
    if (draft.method.trim()) next.method = draft.method.trim()
    else delete next.method
    onSave(next)
  }

  const onEnter = (e: React.KeyboardEvent) => { if (e.key === 'Enter') save() }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Cerrar"><X /></button>
        <h2>{editing ? 'Editar pago' : 'Registrar pago'}</h2>
        <p>La plata que te llegó de verdad. Tasker CRM la compara con lo que estimó por tus horas.</p>
        <div className="form-grid">
          {project
            ? <label>Proyecto<input value={project.name} disabled /></label>
            : <label>Plataforma<select value={draft.clientId} onChange={(e) => setDraft({ ...draft, clientId: e.target.value, method: draft.method || accountFor(e.target.value, clients, payments) })}>{!draft.clientId && <option value="">Elegí…</option>}{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
          <div className="modal-fields two">
            <label>Monto<span className="rate-input"><span>US$</span><input autoFocus inputMode="decimal" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} onKeyDown={onEnter} placeholder="0" /></span></label>
            <label>Fecha<input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></label>
          </div>
          <label>Cuenta donde entró<input list="pay-accounts" value={draft.method} onChange={(e) => setDraft({ ...draft, method: e.target.value })} onKeyDown={onEnter} placeholder="Airtm, PayPal, Banco Galicia…" /></label>
          <datalist id="pay-accounts">{accountOptions(payments).map((m) => <option key={m} value={m} />)}</datalist>
          <label><span>Concepto <span className="optional">(opcional)</span></span><input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} onKeyDown={onEnter} placeholder={draft.bonus ? 'Rewards de misión' : 'Pago semanal'} /></label>
          {!project && <label className="check-line"><input type="checkbox" checked={draft.bonus} onChange={(e) => setDraft({ ...draft, bonus: e.target.checked })} /> Es un bonus o reward (no sale de tus horas)</label>}
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions"><button className="ghost-button" onClick={onClose}>Cancelar</button><button className="primary-button" onClick={save}>{editing ? 'Guardar cambios' : 'Guardar pago'}</button></div>
      </div>
    </div>
  )
}

const EXAMPLE = `22/10/2026  80,83  Outlier
29/10/2026  US$ 120  Estudio Norte  Bonus
Oct 30, 2026  +$95.10 USDC  GreenLight`

type ImportProps = { clients: Client[]; payments: Payment[]; onImport: (ps: Payment[]) => void; onClose: () => void }

/** Pegás varias transferencias de una (de Airtm, PayPal, el banco o una planilla) y se cargan juntas. */
function BulkImport({ clients, payments, onImport, onClose }: ImportProps) {
  const [text, setText] = useState('')
  const [clientId, setClientId] = useState('')
  const [method, setMethod] = useState('')
  const [skip, setSkip] = useState<Record<number, boolean>>({})
  const [pick, setPick] = useState<Record<number, string>>({})
  const parsed = useMemo(() => parsePayments(text, clients, clientId || null, payments), [text, clients, clientId, payments])
  // La plataforma se puede corregir fila por fila.
  const rows = parsed.map((r, i): ParsedLine => {
    if (!pick[i] || r.error === 'Es plata que salió: no se carga' || r.error === 'Sin fecha') return r
    const duplicate = payments.some((p) => p.date === r.date && Math.abs(p.amount - r.amount) < 0.005 && p.clientId === pick[i])
    return { ...r, clientId: pick[i], error: '', duplicate }
  })
  const ready = rows.map((r, i) => ({ r, i })).filter(({ r, i }) => !r.error && !(skip[i] ?? r.duplicate))
  const total = ready.reduce((s, { r }) => s + r.amount, 0)
  const nameOf = (id: string | null) => clients.find((c) => c.id === id)?.name ?? '—'

  function save() {
    onImport(ready.map(({ r }): Payment => ({
      id: uid(), projectId: null, clientId: r.clientId, kind: r.kind, amount: r.amount, date: r.date, paid: true,
      label: r.label || (r.kind === 'bonus' ? 'Bonus' : `Pago ${nameOf(r.clientId)}`),
      ...(method.trim() ? { method: method.trim() } : {}),
    })))
  }

  const status = (r: ParsedLine, i: number) => r.error ? <span className="import-bad">{r.error}</span> : r.duplicate && (skip[i] ?? true) ? <span className="import-dup">Ya cargado</span> : <span className="import-ok">{r.kind === 'bonus' ? 'Bonus' : 'OK'}</span>

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card wide" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Cerrar"><X /></button>
        <h2>Carga masiva de pagos</h2>
        <p>Pegá las transferencias tal cual las copiás de Airtm, PayPal, tu banco o una planilla: una por línea, con fecha y monto. Si la línea nombra la plataforma (o quién paga, ej. “Scale AI”), se reconoce sola.</p>
        <div className="form-grid">
          <div className="modal-fields two">
            <label>Plataforma si la línea no la dice<select value={clientId} onChange={(e) => setClientId(e.target.value)}><option value="">—</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label>Cuenta donde entraron<input list="pay-accounts-bulk" value={method} onChange={(e) => setMethod(e.target.value)} placeholder="Airtm" /></label>
            <datalist id="pay-accounts-bulk">{accountOptions(payments).map((m) => <option key={m} value={m} />)}</datalist>
          </div>
          <label>Transferencias<textarea autoFocus rows={7} className="mono" value={text} onChange={(e) => { setText(e.target.value); setSkip({}); setPick({}) }} placeholder={EXAMPLE} /></label>
        </div>
        {rows.length > 0 && (
          <div className="import-preview">
            <div className="import-row import-head"><span /><span>Fecha</span><span>Plataforma</span><span>Concepto</span><span>Monto</span><span>Estado</span></div>
            {rows.map((r, i) => (
              <div className={`import-row ${r.error ? 'is-off' : ''}`} key={i} title={r.line}>
                <input type="checkbox" disabled={!!r.error} checked={!r.error && !(skip[i] ?? r.duplicate)} onChange={(e) => setSkip({ ...skip, [i]: !e.target.checked })} aria-label="Importar esta línea" />
                <span>{r.date ? fmtDay(r.date) + '/' + r.date.slice(2, 4) : '—'}</span>
                {r.error && r.error !== 'Elegí la plataforma' ? <span>{nameOf(r.clientId)}</span> : <select className="import-pick" value={r.clientId ?? ''} onChange={(e) => setPick({ ...pick, [i]: e.target.value })} aria-label="Plataforma de este pago"><option value="">Elegí…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
                <span className="import-label">{r.label || '—'}</span>
                <strong>{r.amount > 0 ? `US$ ${fmtMoney(r.amount)}` : '—'}</strong>
                {status(r, i)}
              </div>
            ))}
          </div>
        )}
        <div className="modal-actions"><button className="ghost-button" onClick={onClose}>Cancelar</button><button className="primary-button" onClick={save} disabled={ready.length === 0}>{ready.length ? `Cargar ${ready.length} pago${ready.length === 1 ? '' : 's'} · US$ ${fmtMoney(total)}` : 'Cargar pagos'}</button></div>
      </div>
    </div>
  )
}

type Props = { clients: Client[]; projects: Project[]; payments: Payment[]; setPayments: (fn: (p: Payment[]) => Payment[]) => void; today: string }

/** Todos los pagos que recibiste, del más nuevo al más viejo, para ver, corregir o borrar. */
export function PaymentsView({ clients, projects, payments, setPayments, today }: Props) {
  const [form, setForm] = useState<FormProps['start'] | null>(null)
  const [bulk, setBulk] = useState(false)
  const [clientFilter, setClientFilter] = useState('')
  const [query, setQuery] = useState('')

  const clientOf = (p: Payment) => clients.find((c) => c.id === paymentClientId(p, projects)) ?? null
  const q = query.trim().toLowerCase()
  const list = payments
    .filter((p) => p.paid)
    .filter((p) => !clientFilter || paymentClientId(p, projects) === clientFilter)
    .filter((p) => !q || [p.label, p.method ?? '', clientOf(p)?.name ?? '', String(p.amount)].some((t) => t.toLowerCase().includes(q)))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
  const months = [...new Set(list.map((p) => p.date.slice(0, 7)))]
  const thisMonth = today.slice(0, 7)
  const monthTotal = payments.filter((p) => p.paid && p.date.startsWith(thisMonth)).reduce((s, p) => s + p.amount, 0)
  const lastPay = [...payments].filter((p) => p.paid).sort((a, b) => b.date.localeCompare(a.date))[0]

  function save(p: Payment) {
    setPayments((cur) => (cur.some((x) => x.id === p.id) ? cur.map((x) => (x.id === p.id ? p : x)) : [...cur, p]))
    setForm(null)
  }

  function remove(p: Payment) {
    if (window.confirm(`¿Borrar el pago de US$ ${fmtMoney(p.amount)} del ${fmtDay(p.date)}?`)) setPayments((cur) => cur.filter((x) => x.id !== p.id))
  }

  return (
    <section className="view">
      <div className="view-heading">
        <div><h2>Pagos</h2><p className="view-sub">La plata que de verdad te llegó. Con esto Tasker CRM compara lo cobrado contra lo que estimó por tus horas y te avisa si te pagaron de menos.</p></div>
        <div className="heading-actions">
          <button className="ghost-button" onClick={() => setBulk(true)} disabled={clients.length === 0}><ClipboardPaste /> Carga masiva</button>
          <button className="primary-button" onClick={() => setForm({ clientId: defaultClientId(clients, payments) })} disabled={clients.length === 0}><Plus /> Registrar pago</button>
        </div>
      </div>

      {clients.length === 0 && <p className="empty-list">Primero cargá una plataforma en <b>Plataformas</b>: cada pago es de alguna.</p>}

      {payments.some((p) => p.paid) && (
        <div className="summary-grid pay-summary">
          <div className="summary-card"><span><Landmark /> Cobrado en {MONTHS[Number(thisMonth.slice(5, 7)) - 1]}</span><strong>US$ {fmtMoney(monthTotal)}</strong></div>
          {lastPay && <div className="summary-card"><span>Último pago</span><strong>US$ {fmtMoney(lastPay.amount)}</strong><small>{fmtDay(lastPay.date)} · {clientOf(lastPay)?.name ?? PERSONAL}</small></div>}
        </div>
      )}

      {payments.some((p) => p.paid) && (
        <div className="task-filters">
          <label className="search-input"><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar concepto, cuenta o monto" aria-label="Buscar pagos" />{query && <button className="icon-button" onClick={() => setQuery('')} aria-label="Limpiar búsqueda"><X /></button>}</label>
          <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} aria-label="Filtrar por plataforma"><option value="">Todas las plataformas</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </div>
      )}

      {clients.length > 0 && !payments.some((p) => p.paid) && <p className="empty-list">Todavía no cargaste pagos. Tocá <b>Registrar pago</b> cada vez que te llegue una transferencia, o <b>Carga masiva</b> para pegar varias de una.</p>}
      {payments.some((p) => p.paid) && list.length === 0 && <p className="empty-list">No hay pagos con estos filtros.</p>}

      {months.map((m) => {
        const ofMonth = list.filter((p) => p.date.startsWith(m))
        return (
          <div className="client-card pay-month" key={m}>
            <div className="pay-month-head"><strong>{monthLabel(m)}</strong><span>{ofMonth.length} pago{ofMonth.length === 1 ? '' : 's'} · <b>US$ {fmtMoney(ofMonth.reduce((s, p) => s + p.amount, 0))}</b></span></div>
            {ofMonth.map((p) => {
              const c = clientOf(p)
              const project = p.projectId ? projects.find((x) => x.id === p.projectId) : null
              return (
                <div className="pay-row" key={p.id}>
                  <span className="pay-date">{fmtDay(p.date)}</span>
                  <span className="pay-info"><strong><i className="dot" style={{ background: c?.color ?? 'var(--muted)' }} /> {c?.name ?? PERSONAL}{paymentKind(p) === 'bonus' && <span className="status-pill">Bonus</span>}</strong><small>{[project?.name, p.label, p.method].filter(Boolean).join(' · ')}</small></span>
                  <strong className="pay-amount">US$ {fmtMoney(p.amount)}</strong>
                  <span className="row-actions">
                    <button className="icon-button" onClick={() => setForm(p)} aria-label="Editar pago" title="Editar"><Pencil /></button>
                    <button className="icon-button danger" onClick={() => remove(p)} aria-label="Borrar pago" title="Borrar"><Trash2 /></button>
                  </span>
                </div>
              )
            })}
          </div>
        )
      })}

      {form && <PaymentForm clients={clients} projects={projects} payments={payments} start={form} onSave={save} onClose={() => setForm(null)} />}
      {bulk && <BulkImport clients={clients} payments={payments} onImport={(ps) => { setPayments((cur) => [...cur, ...ps]); setBulk(false) }} onClose={() => setBulk(false)} />}
    </section>
  )
}
