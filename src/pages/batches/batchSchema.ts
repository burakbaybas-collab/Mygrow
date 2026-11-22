import { z } from 'zod'

/** Boş metni undefined'a, virgüllü ondalığı noktalıya çevirir. */
export function emptyToUndefinedNumber(v: unknown) {
  if (v === '' || v === null || v === undefined) return undefined
  if (typeof v === 'string') {
    const s = v.trim().replace(',', '.')
    return s === '' ? undefined : Number(s)
  }
  return v
}

const num = (msg = 'Geçerli bir sayı girin') => z.number({ invalid_type_error: msg, required_error: msg })

export const optionalNonNeg = z.preprocess(emptyToUndefinedNumber, num().min(0, 'Negatif olamaz').optional())
export const optionalPositive = z.preprocess(emptyToUndefinedNumber, num().gt(0, 'Sıfırdan büyük olmalı').optional())
export const optionalPercent = z.preprocess(
  emptyToUndefinedNumber,
  num().min(0, 'En az %0').max(100, "%100'ü aşamaz").optional(),
)
export const optionalText = z.string().trim().max(2000).optional()
const optionalDate = z.string().optional()

export const materialSchema = z.object({
  component_name: z.string().trim().min(1, 'Bileşen adı girin').max(200),
  role: z.enum(['substrat', 'katki', 'su', 'ortu_topragi', 'sonradan_eklenen']),
  wet_weight_kg: z.preprocess(emptyToUndefinedNumber, num('Yaş ağırlık girin').min(0, 'Negatif olamaz')),
  moisture_percent: optionalPercent,
  added_on: optionalDate,
  notes: optionalText,
})

export const batchSchema = z
  .object({
    // 1. adım — parti bilgileri
    batch_code: z
      .string()
      .trim()
      .min(1, 'Parti kodu girin')
      .max(60, 'En fazla 60 karakter')
      .regex(/^[\p{L}\p{N}._\-/ ]+$/u, 'Yalnızca harf, rakam, boşluk ve - _ . / kullanılabilir'),
    species_id: z.string().uuid('Mantar türü seçin'),
    strain_id: z.string().optional(),
    cultivation_method: z.enum(['torba', 'blok', 'sise', 'kasa', 'raf_yatak', 'kutuk', 'diger'], {
      errorMap: () => ({ message: 'Üretim yöntemi seçin' }),
    }),
    facility_id: z.string().uuid('Tesis seçin'),
    room_id: z.string().optional(),
    responsible_name: optionalText,
    start_date: z.string().min(1, 'Başlangıç tarihi girin'),
    inoculation_date: optionalDate,
    protocol_id: z.string().optional(),
    initial_stage_id: z.string().optional(),
    is_demo: z.boolean(),
    notes: optionalText,

    // 2. adım — substrat
    recipe_id: z.string().optional(),
    recipe_name: optionalText,
    materials: z.array(materialSchema),
    substrate_ph: z.preprocess(emptyToUndefinedNumber, num().min(0).max(14, 'pH 0–14 arasında olmalı').optional()),
    treatment_method: z.string().optional(),
    treatment_date: optionalDate,
    substrate_notes: optionalText,

    // 3. adım — üretim birimleri
    unit_type: optionalText,
    unit_count: z.preprocess(
      emptyToUndefinedNumber,
      num().int('Tam sayı olmalı').gt(0, 'Sıfırdan büyük olmalı').optional(),
    ),
    wet_substrate_per_unit_kg: optionalPositive,
    spawn_weight_kg: optionalNonNeg,
    spawn_rate_basis: z.enum(['yas', 'kuru']),
  })
  .superRefine((v, ctx) => {
    if (v.inoculation_date && v.start_date && v.inoculation_date < v.start_date) {
      ctx.addIssue({ code: 'custom', path: ['inoculation_date'], message: 'İnokülasyon tarihi başlangıç tarihinden önce olamaz' })
    }
    const hasCount = v.unit_count !== undefined
    const hasPer = v.wet_substrate_per_unit_kg !== undefined
    if (hasCount !== hasPer) {
      ctx.addIssue({
        code: 'custom',
        path: [hasCount ? 'wet_substrate_per_unit_kg' : 'unit_count'],
        message: 'Birim sayısı ve birim başına substrat birlikte girilmelidir',
      })
    }
  })

export type BatchFormValues = z.infer<typeof batchSchema>
export type MaterialFormValues = z.infer<typeof materialSchema>

export const STEP_FIELDS: (keyof BatchFormValues)[][] = [
  [
    'batch_code',
    'species_id',
    'strain_id',
    'cultivation_method',
    'facility_id',
    'room_id',
    'responsible_name',
    'start_date',
    'inoculation_date',
    'protocol_id',
    'initial_stage_id',
    'notes',
  ],
  ['recipe_id', 'recipe_name', 'materials', 'substrate_ph', 'treatment_method', 'treatment_date', 'substrate_notes'],
  ['unit_type', 'unit_count', 'wet_substrate_per_unit_kg', 'spawn_weight_kg', 'spawn_rate_basis'],
]

export const METHOD_UNIT: Record<string, string> = {
  torba: 'Torba',
  blok: 'Blok',
  sise: 'Şişe',
  kasa: 'Kasa',
  raf_yatak: 'Raf/yatak',
  kutuk: 'Kütük',
  diger: 'Birim',
}

/** Parti kodu önerisi: tür kısaltması + tarih (ör. PO-261122) */
export function suggestBatchCode(scientificName: string, date: string): string {
  const parts = scientificName.replace(/\s+spp?\.$/, '').split(/\s+/)
  const abbr = ((parts[0]?.[0] ?? 'X') + (parts[1]?.[0] ?? parts[0]?.[1] ?? 'X')).toUpperCase()
  const d = date.replace(/-/g, '').slice(2)
  return `${abbr}-${d}`
}
