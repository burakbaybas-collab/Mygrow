import { localeTag } from '../i18n'

export function fmtNumber(v: number | null | undefined, maxDigits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  return new Intl.NumberFormat(localeTag, { maximumFractionDigits: maxDigits }).format(v)
}

export function fmtKg(v: number | null | undefined, digits = 2): string {
  const s = fmtNumber(v, digits)
  return s === '—' ? s : `${s} kg`
}

export function fmtPercent(v: number | null | undefined, digits = 1): string {
  const s = fmtNumber(v, digits)
  return s === '—' ? s : `%${s}`
}

export function fmtDate(v: string | null | undefined): string {
  if (!v) return '—'
  const d = new Date(v.length === 10 ? `${v}T00:00:00` : v)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat(localeTag, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
}

export function fmtDateTime(v: string | null | undefined): string {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat(localeTag, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

/** Yerel tarihi YYYY-MM-DD biçiminde döndürür (date input varsayılanı için) */
export function todayIso(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** datetime-local input değeri (YYYY-MM-DDTHH:mm) */
export function nowLocalInput(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
