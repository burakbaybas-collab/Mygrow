// Parti sihirbazı form doğrulama testleri — çalıştırma: npm test
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { batchSchema, suggestBatchCode } from './batchSchema'
const base = { batch_code: 'PO-261122', species_id: '0b8e7a5c-1d2f-4a3b-9c4d-5e6f7a8b9c0d', strain_id: '', cultivation_method: 'torba',
  facility_id: '1b8e7a5c-1d2f-4a3b-9c4d-5e6f7a8b9c0d', room_id: '', start_date: '2026-11-22', inoculation_date: '', protocol_id: '', initial_stage_id: '',
  is_demo: false, notes: '', recipe_id: '', recipe_name: '', materials: [{component_name:'Saman', role:'substrat', wet_weight_kg:'90', moisture_percent:'70,5', added_on:'', notes:''}],
  substrate_ph: '', treatment_method: '', treatment_date: '', substrate_notes: '', unit_type: 'Torba', unit_count: '100', wet_substrate_per_unit_kg: '2', spawn_weight_kg: '', spawn_rate_basis: 'yas' }
describe('batchSchema', () => {
  it('geçerli form', () => { const r = batchSchema.safeParse(base); assert.ok(r.success, JSON.stringify(r.error?.issues)); assert.equal(r.data!.materials[0].moisture_percent, 70.5); assert.equal(r.data!.unit_count, 100); assert.equal(r.data!.substrate_ph, undefined) })
  it('nem >100 hatası', () => { const r = batchSchema.safeParse({...base, materials:[{...base.materials[0], moisture_percent:'120'}]}); assert.ok(!r.success); assert.match(r.error!.issues[0].message, /100/) })
  it('harf girilen sayı', () => { const r = batchSchema.safeParse({...base, unit_count:'abc'}); assert.ok(!r.success); assert.equal(r.error!.issues[0].message, 'Geçerli bir sayı girin') })
  it('birim sayısı tek başına', () => { const r = batchSchema.safeParse({...base, wet_substrate_per_unit_kg:''}); assert.ok(!r.success); assert.deepEqual(r.error!.issues[0].path, ['wet_substrate_per_unit_kg']) })
  it('inokülasyon başlangıçtan önce', () => { const r = batchSchema.safeParse({...base, inoculation_date:'2026-11-01'}); assert.ok(!r.success) })
  it('yöntem boş', () => { const r = batchSchema.safeParse({...base, cultivation_method:''}); assert.ok(!r.success); assert.equal(r.error!.issues[0].message,'Üretim yöntemi seçin') })
  it('kod önerisi', () => { assert.equal(suggestBatchCode('Flammulina spp.','2026-11-22'),'FL-261122'); assert.equal(suggestBatchCode('Pleurotus ostreatus','2026-11-22'),'PO-261122') })
})
