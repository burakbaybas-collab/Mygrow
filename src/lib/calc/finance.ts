import { type CalcResult, checkNonNegative, fail, ok, round } from './core'

export const COST_CATEGORIES = ['substrat', 'misel', 'enerji', 'su', 'iscilik', 'ambalaj', 'diger'] as const
export type CostCategory = (typeof COST_CATEGORIES)[number]

export interface CostInput {
  category: CostCategory
  amount: number
  currency?: string
}

export interface CostSummary {
  total: number
  byCategory: Record<CostCategory, number>
  /** Hiç kayıt girilmemiş kategoriler: sonucun eksik olabileceğini göstermek için */
  missingCategories: CostCategory[]
  currency: string
}

/** 7.9 Kayıtlı üretim maliyeti = Substrat + Misel + Enerji + Su + İşçilik + Ambalaj + Diğer */
export function productionCost(entries: CostInput[], currency = 'TRY'): CalcResult<CostSummary> {
  const byCategory = Object.fromEntries(COST_CATEGORIES.map((c) => [c, 0])) as Record<CostCategory, number>
  const seen = new Set<CostCategory>()
  for (const e of entries) {
    if ((e.currency ?? currency) !== currency) {
      return fail(`Farklı para birimleri (${e.currency} / ${currency}) aynı toplamda birleştirilemez`)
    }
    if (!COST_CATEGORIES.includes(e.category)) return fail(`Bilinmeyen gider kategorisi: ${e.category}`)
    const err = checkNonNegative(e.amount, 'Gider tutarı')
    if (err) return fail(err)
    byCategory[e.category] = round(byCategory[e.category] + e.amount, 4)
    seen.add(e.category)
  }
  const total = round(Object.values(byCategory).reduce((a, b) => a + b, 0), 4)
  return ok({ total, byCategory, missingCategories: COST_CATEGORIES.filter((c) => !seen.has(c)), currency })
}

/** Birim maliyet (TL/kg) = Kayıtlı toplam gider / Pazarlanabilir mantar ağırlığı */
export function unitCostPerKg(totalCost: number | undefined, marketableKg: number | undefined): CalcResult {
  const e1 = checkNonNegative(totalCost, 'Toplam gider')
  if (e1) return fail(e1)
  const e2 = checkNonNegative(marketableKg, 'Pazarlanabilir mantar')
  if (e2) return fail(e2)
  if (marketableKg === 0) return fail('Pazarlanabilir mantar miktarı sıfır olduğu için birim maliyet hesaplanamıyor')
  return ok(round((totalCost as number) / (marketableKg as number), 4))
}

export interface SaleInput {
  quantityKg: number
  unitPrice: number
  currency?: string
}

/** 7.10 Satış geliri = Σ (Satılan miktar × Birim fiyat) */
export function salesRevenue(sales: SaleInput[], currency = 'TRY'): CalcResult {
  let total = 0
  for (const s of sales) {
    if ((s.currency ?? currency) !== currency) return fail('Farklı para birimleri aynı toplamda birleştirilemez')
    const e1 = checkNonNegative(s.quantityKg, 'Satış miktarı')
    if (e1) return fail(e1)
    const e2 = checkNonNegative(s.unitPrice, 'Birim fiyat')
    if (e2) return fail(e2)
    total += s.quantityKg * s.unitPrice
  }
  return ok(round(total, 4))
}

export interface Contribution {
  value: number
  /** Bütün gider kategorileri kayıtlı değilse sonuç NET KÂR değildir. */
  label: 'Kayıtlı katkı' | 'Kayıtlı katkı (eksik giderler olabilir)'
  isNetProfit: false
}

/**
 * Kayıtlı katkı = Satış geliri − Kayıtlı giderler.
 * Uygulama bu değeri hiçbir zaman "net kâr" olarak etiketlemez; işletmenin tüm giderleri
 * (amortisman, kira, genel giderler vb.) kayıtlı olmayabilir.
 */
export function contribution(revenue: number | undefined, recordedCost: CostSummary | undefined): CalcResult<Contribution> {
  const e1 = checkNonNegative(revenue, 'Satış geliri')
  if (e1) return fail(e1)
  if (!recordedCost) return fail('Gider kaydı bulunmuyor')
  const value = round((revenue as number) - recordedCost.total, 4)
  const warnings = recordedCost.missingCategories.length
    ? [`Kaydı olmayan gider kategorileri: ${recordedCost.missingCategories.join(', ')}`]
    : []
  return ok(
    {
      value,
      label: recordedCost.missingCategories.length ? 'Kayıtlı katkı (eksik giderler olabilir)' : 'Kayıtlı katkı',
      isNetProfit: false,
    },
    warnings,
  )
}
