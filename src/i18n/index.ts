import { tr, type Dictionary } from './tr'

export type Locale = 'tr'

const dictionaries: Record<Locale, Dictionary> = { tr }

let current: Locale = 'tr'

export function setLocale(locale: Locale) {
  current = locale
}

/** Aktif dilin sözlüğü */
export function dict(): Dictionary {
  return dictionaries[current]
}

/** Bir sayım (enum) değerinin etiketini döndürür; bilinmiyorsa değerin kendisini. */
export function label<G extends keyof Dictionary>(group: G, key: string | null | undefined): string {
  if (!key) return '—'
  const g = dictionaries[current][group] as Record<string, string>
  return g[key] ?? key
}

/** Seçim kutuları için [değer, etiket] listesi */
export function options<G extends keyof Dictionary>(group: G): { value: string; label: string }[] {
  const g = dictionaries[current][group] as Record<string, string>
  return Object.entries(g).map(([value, l]) => ({ value, label: l }))
}

export const localeTag = 'tr-TR'
