import { type CalcResult, checkNonNegative, fail, ok, round } from './core'

export interface HarvestInput {
  flushNumber: number
  totalFreshKg: number
  marketableKg?: number | null
  harvestedAt: string | Date
}

function sumFresh(harvests: HarvestInput[]): CalcResult {
  let total = 0
  for (const h of harvests) {
    const e = checkNonNegative(h.totalFreshKg, 'Hasat ağırlığı')
    if (e) return fail(e)
    total += h.totalFreshKg
  }
  return ok(round(total))
}

export function totalHarvest(harvests: HarvestInput[]): CalcResult {
  return sumFresh(harvests)
}

/**
 * 7.4 Biyolojik etkinlik (%) = Toplam taze mantar / Başlangıç kuru substrat × 100
 * %100'ün üzerindeki değerler hata kabul edilmez (taze ağırlık / kuru ağırlık oranıdır).
 */
export function biologicalEfficiency(totalFreshKg: number | undefined, initialDryKg: number | undefined | null): CalcResult {
  if (initialDryKg === undefined || initialDryKg === null) {
    return fail('Başlangıç kuru substrat bilinmediği için BE hesaplanamıyor')
  }
  const e1 = checkNonNegative(initialDryKg, 'Başlangıç kuru substrat')
  if (e1) return fail(e1)
  if (initialDryKg === 0) return fail('Başlangıç kuru substrat sıfır olduğu için BE hesaplanamıyor')
  const e2 = checkNonNegative(totalFreshKg, 'Toplam taze mantar')
  if (e2) return fail(e2)
  return ok(round(((totalFreshKg as number) / initialDryKg) * 100, 4))
}

/** 7.5 Birim verimi (kg/birim) = Toplam taze hasat / Başlangıç üretim birimi sayısı */
export function yieldPerUnit(totalFreshKg: number | undefined, initialUnits: number | undefined | null): CalcResult {
  if (initialUnits === undefined || initialUnits === null) return fail('Başlangıç birim sayısı bilinmiyor')
  const e = checkNonNegative(initialUnits, 'Başlangıç birim sayısı')
  if (e) return fail(e)
  if (initialUnits === 0) return fail('Başlangıç birim sayısı sıfır')
  const e2 = checkNonNegative(totalFreshKg, 'Toplam taze hasat')
  if (e2) return fail(e2)
  return ok(round((totalFreshKg as number) / initialUnits, 4))
}

export interface FlushShare {
  flushNumber: number
  totalKg: number
  harvestCount: number
  sharePercent: number
}

/** 7.6 Flush verim payı (%) = İlgili flush hasadı / Toplam parti hasadı × 100 (aynı flush farklı günlerde toplanır) */
export function flushShares(harvests: HarvestInput[]): CalcResult<FlushShare[]> {
  const total = sumFresh(harvests)
  if (!total.ok) return fail(total.reason)
  if (harvests.length === 0) return fail('Hasat kaydı yok')
  if (total.value === 0) return fail('Toplam hasat sıfır olduğu için flush payı hesaplanamıyor')
  const map = new Map<number, { kg: number; n: number }>()
  for (const h of harvests) {
    if (!Number.isInteger(h.flushNumber) || h.flushNumber < 1) return fail('Flush numarası 1 veya daha büyük tam sayı olmalı')
    const cur = map.get(h.flushNumber) ?? { kg: 0, n: 0 }
    cur.kg += h.totalFreshKg
    cur.n += 1
    map.set(h.flushNumber, cur)
  }
  const rows = [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([flushNumber, { kg, n }]) => ({
      flushNumber,
      totalKg: round(kg),
      harvestCount: n,
      sharePercent: round((kg / total.value) * 100, 4),
    }))
  return ok(rows)
}

const DAY_MS = 86_400_000

function toUtcDay(d: string | Date): number {
  const date = typeof d === 'string' ? new Date(d.length === 10 ? `${d}T00:00:00Z` : d) : d
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

/** 7.7 İlk hasada kadar geçen gün = İlk hasat tarihi − İnokülasyon tarihi */
export function daysToFirstHarvest(inoculationDate: string | null | undefined, harvests: HarvestInput[]): CalcResult {
  if (!inoculationDate) return fail('İnokülasyon tarihi girilmemiş')
  if (harvests.length === 0) return fail('Henüz hasat kaydı yok')
  const first = Math.min(...harvests.map((h) => toUtcDay(h.harvestedAt)))
  const ino = toUtcDay(inoculationDate)
  if (!Number.isFinite(first) || !Number.isFinite(ino)) return fail('Tarih biçimi geçersiz')
  const days = Math.round((first - ino) / DAY_MS)
  if (days < 0) return fail('İlk hasat tarihi inokülasyon tarihinden önce görünüyor; tarihleri kontrol edin')
  return ok(days)
}

/** Başlangıçtan bugüne geçen gün (kartlarda "geçen gün") */
export function daysSince(date: string | null | undefined, today: Date = new Date()): number | null {
  if (!date) return null
  const d = toUtcDay(date)
  if (!Number.isFinite(d)) return null
  return Math.max(0, Math.round((toUtcDay(today) - d) / DAY_MS))
}

export interface LossInput {
  newlyDiscardedUnits: number
}

/**
 * 7.8 Kayıp oranı (%) = Tekilleştirilmiş imha edilen birimler / Başlangıç birimleri × 100
 * Her kayıp kaydı yalnızca O olayda YENİ imha edilen birimleri içerir; böylece toplam çift sayım içermez.
 */
export function lossRate(events: LossInput[], initialUnits: number | undefined | null): CalcResult<{ discarded: number; percent: number }> {
  if (initialUnits === undefined || initialUnits === null || initialUnits <= 0) {
    return fail('Başlangıç birim sayısı bilinmediği için kayıp oranı hesaplanamıyor')
  }
  let discarded = 0
  for (const e of events) {
    const err = checkNonNegative(e.newlyDiscardedUnits, 'İmha edilen birim')
    if (err) return fail(err)
    if (!Number.isInteger(e.newlyDiscardedUnits)) return fail('İmha edilen birim sayısı tam sayı olmalı')
    discarded += e.newlyDiscardedUnits
  }
  if (discarded > initialUnits) {
    return fail(`İmha edilen birim toplamı (${discarded}) başlangıç biriminden (${initialUnits}) fazla; çift sayım olabilir`)
  }
  return ok({ discarded, percent: round((discarded / initialUnits) * 100, 4) })
}
