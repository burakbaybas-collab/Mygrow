import { type CalcResult, checkNonNegative, checkPercent, fail, ok, round } from './core'

/** Başlangıç substratına dahil olan roller (BE paydası). Örtü toprağı ve sonradan eklenenler hariç. */
export const INITIAL_SUBSTRATE_ROLES = ['substrat', 'katki', 'su'] as const
export type MaterialRole = 'substrat' | 'katki' | 'su' | 'ortu_topragi' | 'sonradan_eklenen'

export interface MaterialInput {
  name?: string
  role?: MaterialRole
  wetKg: number | undefined
  moisturePercent: number | undefined
}

export function isInitialSubstrate(role: MaterialRole | undefined): boolean {
  return (INITIAL_SUBSTRATE_ROLES as readonly string[]).includes(role ?? 'substrat')
}

/** 7.1 Toplam yaş substrat (kg) = Birim sayısı × Birim başına yaş substrat (kg) */
export function totalWetSubstrate(unitCount: number | undefined, perUnitKg: number | undefined): CalcResult {
  const e1 = checkNonNegative(unitCount, 'Üretim birimi sayısı')
  if (e1) return fail(e1)
  const e2 = checkNonNegative(perUnitKg, 'Birim başına yaş substrat')
  if (e2) return fail(e2)
  if (!Number.isInteger(unitCount)) return fail('Üretim birimi sayısı tam sayı olmalı')
  if (unitCount === 0) return fail('Üretim birimi sayısı sıfır olamaz')
  if (perUnitKg === 0) return fail('Birim başına substrat sıfır olamaz')
  return ok(round((unitCount as number) * (perUnitKg as number)))
}

/** 7.2 Kuru substrat (kg) = Yaş substrat (kg) × (1 − Nem oranı / 100) */
export function dryWeight(wetKg: number | undefined, moisturePercent: number | undefined): CalcResult {
  const e1 = checkNonNegative(wetKg, 'Yaş ağırlık')
  if (e1) return fail(e1)
  const e2 = checkPercent(moisturePercent, 'Nem oranı')
  if (e2) return fail(e2)
  return ok(round((wetKg as number) * (1 - (moisturePercent as number) / 100)))
}

export interface MixSummary {
  mixWetKg: number
  mixDryKg: number
  /** Karışımın kuru madde oranı (0–1) */
  dryRatio: number
  componentCount: number
}

/**
 * Başlangıç substratı karışımı: her bileşenin kuru ağırlığı ayrı hesaplanıp toplanır.
 * Örtü toprağı / sonradan eklenen bileşenler hariç tutulur.
 */
export function substrateMix(materials: MaterialInput[]): CalcResult<MixSummary> {
  const initial = materials.filter((m) => isInitialSubstrate(m.role))
  if (initial.length === 0) return fail('Başlangıç substratı bileşeni girilmemiş')
  let wet = 0
  let dry = 0
  for (const [i, m] of initial.entries()) {
    const label = m.name?.trim() ? `"${m.name.trim()}"` : `${i + 1}. bileşen`
    const r = dryWeight(m.wetKg, m.moisturePercent)
    if (!r.ok) return fail(`${label}: ${r.reason}`)
    wet += m.wetKg as number
    dry += r.value
  }
  if (wet === 0) return fail('Başlangıç substratının toplam yaş ağırlığı sıfır')
  return ok({ mixWetKg: round(wet), mixDryKg: round(dry), dryRatio: round(dry / wet, 9), componentCount: initial.length })
}

export type DrySubstrateMethod = 'dolum_x_karisim_kuru_orani' | 'karisim_toplami'

export interface InitialSubstrate {
  totalWetKg: number
  totalDryKg: number
  method: DrySubstrateMethod
}

/**
 * Başlangıç kuru substrat — BÜTÜN partilerde aynı tanım (veri tabanındaki create_batch ile birebir):
 *  - Birim dolumu girildiyse: toplam kuru = (birim sayısı × birim yaş ağırlığı) × karışım kuru oranı
 *  - Girilmediyse:            toplam kuru = Σ bileşen kuru ağırlığı
 */
export function initialSubstrate(params: {
  materials: MaterialInput[]
  unitCount?: number
  perUnitKg?: number
}): CalcResult<InitialSubstrate> {
  const mix = substrateMix(params.materials)
  if (!mix.ok) return fail(mix.reason)
  const warnings: string[] = []
  const hasFill = params.unitCount !== undefined && params.perUnitKg !== undefined
  if (hasFill) {
    const fill = totalWetSubstrate(params.unitCount, params.perUnitKg)
    if (!fill.ok) return fail(fill.reason)
    if (fill.value > mix.value.mixWetKg * 1.02) {
      warnings.push(
        `Doldurulan toplam yaş substrat (${fill.value} kg), hazırlanan karışımdan (${mix.value.mixWetKg} kg) fazla görünüyor. Bileşen ağırlıklarını kontrol edin.`,
      )
    }
    return ok(
      { totalWetKg: fill.value, totalDryKg: round(fill.value * mix.value.dryRatio), method: 'dolum_x_karisim_kuru_orani' },
      warnings,
    )
  }
  return ok({ totalWetKg: mix.value.mixWetKg, totalDryKg: mix.value.mixDryKg, method: 'karisim_toplami' }, warnings)
}

export type SpawnBasis = 'yas' | 'kuru'

/** 7.3 Misel oranı (%) = Misel ağırlığı / Seçilen substrat ağırlığı × 100 (payda açıkça belirtilir) */
export function spawnRate(spawnKg: number | undefined, basis: SpawnBasis, substrateKg: number | undefined): CalcResult {
  const e1 = checkNonNegative(spawnKg, 'Misel ağırlığı')
  if (e1) return fail(e1)
  const label = basis === 'yas' ? 'Yaş substrat' : 'Kuru substrat'
  const e2 = checkNonNegative(substrateKg, label)
  if (e2) return fail(e2)
  if (substrateKg === 0) return fail(`${label} sıfır olduğu için misel oranı hesaplanamıyor`)
  return ok(round(((spawnKg as number) / (substrateKg as number)) * 100))
}
