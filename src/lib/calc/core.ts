/**
 * Hesaplama sonuç tipi: her hesap ya bir değer ya da kullanıcıya gösterilebilecek
 * Türkçe bir gerekçe döndürür. Sessizce 0, NaN veya Infinity üretilmez.
 */
export type CalcResult<T = number> = { ok: true; value: T; warnings: string[] } | { ok: false; reason: string }

export const ok = <T>(value: T, warnings: string[] = []): CalcResult<T> => ({ ok: true, value, warnings })
export const fail = <T = number>(reason: string): CalcResult<T> => ({ ok: false, reason })

/** null/undefined/boş metin => undefined; sayıya çevrilemeyen => NaN */
export function toNumber(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined
  if (typeof v === 'string') {
    const s = v.trim().replace(',', '.')
    if (s === '') return undefined
    return Number(s)
  }
  if (typeof v === 'number') return v
  return Number.NaN
}

export function isValidNumber(v: number | undefined | null): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/** Negatif olmayan geçerli sayı kontrolü; hata varsa gerekçe döner. */
export function checkNonNegative(v: number | undefined | null, label: string): string | null {
  if (v === undefined || v === null) return `${label} girilmemiş`
  if (!Number.isFinite(v)) return `${label} geçerli bir sayı değil`
  if (v < 0) return `${label} negatif olamaz`
  return null
}

export function checkPercent(v: number | undefined | null, label: string): string | null {
  const e = checkNonNegative(v, label)
  if (e) return e
  if ((v as number) > 100) return `${label} %100'ü aşamaz`
  return null
}

/** Kayan nokta gürültüsünü temizler (ör. 0.30000000000000004 → 0.3). */
export function round(v: number, digits = 6): number {
  const f = 10 ** digits
  return Math.round(v * f) / f
}
