// Veri tabanı satır tipleri (supabase/migrations ile uyumlu).
// İleride `supabase gen types typescript` çıktısıyla değiştirilebilir.

export type MemberRole = 'owner' | 'manager' | 'staff' | 'viewer'
export type CultivationMethod = 'torba' | 'blok' | 'sise' | 'kasa' | 'raf_yatak' | 'kutuk' | 'diger'
export type VerificationStatus = 'dogrulanmamis' | 'kaynakli' | 'uzman_dogrulamali'
export type StageCategory =
  | 'hazirlik'
  | 'inokulasyon'
  | 'inkubasyon'
  | 'induksiyon'
  | 'primordium'
  | 'fruktifikasyon'
  | 'hasat'
  | 'dinlenme'
  | 'kurutma'
  | 'diger'
export type BatchStatus = 'aktif' | 'tamamlandi' | 'arsivlendi'
export type SubstrateTreatment = 'pastorizasyon' | 'sterilizasyon' | 'kompostlama' | 'yok' | 'diger'
export type MaterialRole = 'substrat' | 'katki' | 'su' | 'ortu_topragi' | 'sonradan_eklenen'
export type SpawnBasis = 'yas' | 'kuru'
export type IdentityStatus = 'dogrulanmis' | 'dogrulanmamis' | 'bilinmiyor'
export type OrgType = 'isletme' | 'laboratuvar' | 'universite' | 'arastirma_enstitusu' | 'girisim' | 'diger'
export type RoomType = 'hazirlik' | 'inkubasyon' | 'uretim' | 'laboratuvar' | 'depo' | 'diger'

export interface Organization {
  id: string
  name: string
  org_type: OrgType
  city: string | null
  country: string
  created_at: string
}

export interface Membership {
  id: string
  organization_id: string
  user_id: string
  role: MemberRole
  display_name: string | null
  email: string | null
  organization?: Organization
}

export interface Species {
  id: string
  organization_id: string | null
  scientific_name: string
  turkish_name: string | null
  genus: string
  specific_epithet: string | null
  is_species_group: boolean
  cultivation_methods: CultivationMethod[]
  substrates: string[]
  description: string | null
  source_notes: string | null
}

export interface Facility {
  id: string
  organization_id: string
  name: string
  city: string | null
  address: string | null
  notes: string | null
}

export interface Room {
  id: string
  organization_id: string
  facility_id: string
  name: string
  room_type: RoomType
  area_m2: number | null
  notes: string | null
  is_active: boolean
}

export interface Strain {
  id: string
  organization_id: string
  species_id: string
  code: string
  name: string | null
  source_type: string | null
  origin: string | null
  identity_status: IdentityStatus
  exact_species_name: string | null
  collection_reference: string | null
  isolation_date: string | null
  notes: string | null
  is_active: boolean
}

export interface Protocol {
  id: string
  organization_id: string | null
  species_id: string
  strain_id: string | null
  cultivation_method: CultivationMethod | null
  name: string
  version: number
  verification_status: VerificationStatus
  source_reference: string | null
  verified_by: string | null
  notes: string | null
  based_on_protocol_id: string | null
  is_archived: boolean
  updated_at: string
}

export interface ProtocolStage {
  id: string
  protocol_id: string
  stage_order: number
  name: string
  category: StageCategory
  duration_days_min: number | null
  duration_days_max: number | null
  air_temp_min: number | null
  air_temp_max: number | null
  substrate_temp_min: number | null
  substrate_temp_max: number | null
  rh_min: number | null
  rh_max: number | null
  co2_min: number | null
  co2_max: number | null
  light_lux_min: number | null
  light_lux_max: number | null
  light_hours_per_day: number | null
  notes: string | null
}

export interface SubstrateRecipe {
  id: string
  organization_id: string
  name: string
  version: number
  species_id: string | null
  default_treatment: SubstrateTreatment | null
  description: string | null
  notes: string | null
  is_archived: boolean
}

export interface RecipeComponent {
  id: string
  recipe_id: string
  sort_order: number
  component_name: string
  role: MaterialRole
  proportion_percent: number | null
  default_moisture_percent: number | null
  notes: string | null
}

export interface ProtocolSnapshot {
  protocol: Protocol
  stages: ProtocolStage[]
  snapshot_at: string
}

export interface Batch {
  id: string
  organization_id: string
  batch_code: string
  species_id: string
  strain_id: string | null
  protocol_id: string | null
  protocol_snapshot: ProtocolSnapshot | null
  recipe_id: string | null
  recipe_name: string | null
  recipe_version: number | null
  cultivation_method: CultivationMethod
  facility_id: string
  room_id: string | null
  responsible_name: string | null
  start_date: string
  inoculation_date: string | null
  status: BatchStatus
  current_stage_name: string | null
  current_stage_category: StageCategory | null
  current_stage_started_at: string | null
  unit_type: string | null
  unit_count: number | null
  wet_substrate_per_unit_kg: number | null
  total_wet_substrate_kg: number | null
  total_dry_substrate_kg: number | null
  dry_substrate_method: 'dolum_x_karisim_kuru_orani' | 'karisim_toplami' | null
  spawn_weight_kg: number | null
  spawn_rate_basis: SpawnBasis | null
  spawn_rate_percent: number | null
  substrate_ph: number | null
  treatment_method: SubstrateTreatment | null
  treatment_date: string | null
  substrate_notes: string | null
  notes: string | null
  is_demo: boolean
  last_record_at: string
  completed_at: string | null
  archived_at: string | null
  created_at: string
  // ilişkili (select ile birleştirilen) alanlar
  species?: Pick<Species, 'id' | 'scientific_name' | 'turkish_name' | 'is_species_group'> | null
  strain?: Pick<Strain, 'id' | 'code' | 'name' | 'identity_status' | 'exact_species_name'> | null
  room?: Pick<Room, 'id' | 'name'> | null
  facility?: Pick<Facility, 'id' | 'name'> | null
}

export interface BatchMaterial {
  id: string
  batch_id: string
  sort_order: number
  component_name: string
  role: MaterialRole
  wet_weight_kg: number
  moisture_percent: number | null
  dry_weight_kg: number | null
  added_on: string | null
  notes: string | null
}

export interface StageHistory {
  id: string
  batch_id: string
  protocol_stage_id: string | null
  stage_order: number | null
  stage_name: string
  category: StageCategory
  started_at: string
  ended_at: string | null
  notes: string | null
  created_at: string
}

export interface HarvestRow {
  id: string
  batch_id: string
  harvested_at: string
  flush_number: number
  total_fresh_kg: number
  marketable_kg: number | null
  cull_kg: number | null
}
