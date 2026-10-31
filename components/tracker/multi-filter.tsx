'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

type Props = { options: { id: string; label: string; color?: string }[]; value: string[]; onChange: (v: string[]) => void; allLabel: string; noun: string }

/** Lista desplegable con casillas: vacío = todas; si no, sólo las elegidas. */
export function MultiFilter({ options, value, onChange, allLabel, noun }: Props) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const off = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', off)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc) }
  }, [open])

  const picked = options.filter((o) => value.includes(o.id))
  const label = picked.length === 0 ? allLabel : picked.length <= 2 ? picked.map((o) => o.label).join(' + ') : `${picked.length} ${noun}`
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])

  return (
    <div className="multi" ref={box}>
      <button type="button" className={`multi-button ${picked.length ? 'multi-on' : ''}`} onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}>{label}<ChevronDown /></button>
      {open && (
        <div className="multi-menu" role="listbox" aria-multiselectable="true">
          <button type="button" role="option" aria-selected={picked.length === 0} className="multi-item" onClick={() => onChange([])}><i className={`multi-box ${picked.length === 0 ? 'on' : ''}`}>{picked.length === 0 && <Check />}</i>{allLabel}</button>
          {options.map((o) => {
            const on = value.includes(o.id)
            return <button type="button" role="option" aria-selected={on} key={o.id} className="multi-item" onClick={() => toggle(o.id)}><i className={`multi-box ${on ? 'on' : ''}`}>{on && <Check />}</i>{o.color && <i className="dot" style={{ background: o.color }} />}{o.label}</button>
          })}
        </div>
      )}
    </div>
  )
}
