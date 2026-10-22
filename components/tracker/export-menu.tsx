'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ClipboardCopy, Download, FileSpreadsheet, FileText, UserRound } from 'lucide-react'
import { dateKey, type Task } from '@/lib/game'
import { download, slug, tasksToCsv, tasksToMarkdown } from '@/lib/export'

type Props = { tasks: Task[]; title: string; label?: string }

/** Botón “Exportar” con las tareas que se le pasan (las filtradas, las elegidas o las de un cliente). */
export function ExportMenu({ tasks, title, label = 'Exportar' }: Props) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])

  const name = `${slug(title)}-${dateKey()}`
  const md = (forClient = false) => tasksToMarkdown(tasks, title, { forClient })

  async function copy() {
    try {
      await navigator.clipboard.writeText(md())
      setCopied(true)
      window.setTimeout(() => { setCopied(false); setOpen(false) }, 1200)
    } catch {
      // Sin permiso para el portapapeles: se descarga el archivo.
      download(`${name}.md`, md(), 'text/markdown;charset=utf-8')
      setOpen(false)
    }
  }

  return (
    <div className="export-wrap" ref={ref}>
      <button className="ghost-button" onClick={() => setOpen((o) => !o)} disabled={tasks.length === 0} aria-expanded={open} title={tasks.length ? `Exportar ${tasks.length} tarea${tasks.length === 1 ? '' : 's'}` : 'No hay tareas para exportar'}><Download /> {label}</button>
      {open && (
        <div className="export-pop" role="menu">
          <p className="picker-group">{tasks.length} tarea{tasks.length === 1 ? '' : 's'}, con sus notas</p>
          <button role="menuitem" onClick={copy}>{copied ? <Check /> : <ClipboardCopy />}<span><b>{copied ? 'Copiado' : 'Copiar para una IA'}</b><small>Texto listo para pegar y pedir que analice tus patrones</small></span></button>
          <button role="menuitem" onClick={() => { download(`${name}.md`, md(), 'text/markdown;charset=utf-8'); setOpen(false) }}><FileText /><span><b>Markdown (.md)</b><small>Por día, con proyecto, montos y notas</small></span></button>
          <button role="menuitem" onClick={() => { download(`${name}-cliente.md`, md(true), 'text/markdown;charset=utf-8'); setOpen(false) }}><UserRound /><span><b>Reporte para el cliente</b><small>Qué hiciste y cuánto tiempo, sin montos</small></span></button>
          <button role="menuitem" onClick={() => { download(`${name}.csv`, tasksToCsv(tasks), 'text/csv;charset=utf-8'); setOpen(false) }}><FileSpreadsheet /><span><b>Planilla (.csv)</b><small>Para Excel o Google Sheets</small></span></button>
        </div>
      )}
    </div>
  )
}
