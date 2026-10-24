'use client'

import { useEffect, useRef, type TextareaHTMLAttributes } from 'react'

/** Textarea que crece con el texto: se lee entera sin scroll hasta `max` px, después scrollea. */
export function AutoTextarea({ max = 480, value, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string; max?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(max, el.scrollHeight + 2)}px`
    el.style.overflowY = el.scrollHeight + 2 > max ? 'auto' : 'hidden'
  }, [value, max])
  return <textarea ref={ref} value={value} {...props} />
}
