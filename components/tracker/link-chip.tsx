import { BookOpen, Briefcase, ExternalLink, FileText, MessageSquare, Plus, Receipt, Video, X } from 'lucide-react'
import { LINK_KIND_LABEL, linkKind, type Link, type LinkKind } from '@/lib/game'

const ICONS: Record<LinkKind, typeof ExternalLink> = {
  slack: MessageSquare, meet: Video, doc: FileText, manual: BookOpen, pago: Receipt, plataforma: Briefcase, otro: ExternalLink,
}

export function LinkChip({ link }: { link: Link }) {
  const kind = linkKind(link)
  const Icon = ICONS[kind]
  return (
    <a className={`link-chip link-${kind}`} href={link.url} target="_blank" rel="noreferrer noopener" title={`${LINK_KIND_LABEL[kind]}: ${link.url}`}>
      <Icon /> {link.label}
    </a>
  )
}

const PLACEHOLDERS = ['Slack del proyecto', 'Manual / guidelines', 'Meet de la reunión', 'Doc de la reunión']

/** Editor de una lista de links con nombre y URL. */
export function LinksEditor({ links, onChange, urlPlaceholder = 'https://…' }: { links: Link[]; onChange: (links: Link[]) => void; urlPlaceholder?: string }) {
  return (
    <div className="field"><span>Links a mano</span>
      {links.map((l, i) => (
        <div className="link-edit" key={i}>
          <input value={l.label} onChange={(e) => onChange(links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder={PLACEHOLDERS[i % PLACEHOLDERS.length]} aria-label="Nombre del link" />
          <input value={l.url} onChange={(e) => onChange(links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} placeholder={urlPlaceholder} aria-label="URL" inputMode="url" />
          <button type="button" className="icon-button" onClick={() => onChange(links.filter((_, j) => j !== i))} aria-label="Quitar link"><X /></button>
        </div>
      ))}
      <button type="button" className="text-button" onClick={() => onChange([...links, { label: '', url: '' }])}><Plus /> Agregar link</button>
      <small className="field-help">Slack, Meet, manuales, docs de reuniones (Drive, Notion…). Se muestran como atajos en el timer.</small>
    </div>
  )
}
