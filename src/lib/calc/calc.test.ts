// Hesaplama birim testleri — çalıştırma: npm test
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  biologicalEfficiency,
  contribution,
  daysToFirstHarvest,
  dryWeight,
  flushShares,
  initialSubstrate,
  lossRate,
  productionCost,
  salesRevenue,
  spawnRate,
  substrateMix,
  toNumber,
  totalWetSubstrate,
  unitCostPerKg,
  yieldPerUnit,
  type CalcResult,
} from './index'

function value<T>(r: CalcResult<T>): T {
  if (!r.ok) assert.fail(`Beklenen başarılı sonuç, gelen hata: ${r.reason}`)
  return r.value
}
function reason<T>(r: CalcResult<T>): string {
  if (r.ok) assert.fail(`Beklenen hata, gelen değer: ${JSON.stringify(r.value)}`)
  return r.reason
}

describe('7.1 toplam yaş substrat', () => {
  it('birim × birim ağırlığı', () => assert.equal(value(totalWetSubstrate(100, 2.5)), 250))
  it('sıfır birim reddedilir', () => assert.match(reason(totalWetSubstrate(0, 2)), /sıfır/))
  it('negatif ağırlık reddedilir', () => assert.match(reason(totalWetSubstrate(10, -1)), /negatif/))
  it('kesirli birim sayısı reddedilir', () => assert.match(reason(totalWetSubstrate(10.5, 1)), /tam sayı/))
  it('eksik veri reddedilir', () => assert.match(reason(totalWetSubstrate(undefined, 1)), /girilmemiş/))
})

describe('7.2 kuru madde', () => {
  it('yaş × (1 − nem/100)', () => assert.equal(value(dryWeight(10, 65)), 3.5))
  it('nem %100 üstü reddedilir', () => assert.match(reason(dryWeight(10, 120)), /%100/))
  it('su (%100 nem) kuru maddeye katkı vermez', () => assert.equal(value(dryWeight(20, 100)), 0))
  it('bileşenler ayrı hesaplanıp toplanır; örtü/sonradan eklenen hariç', () => {
    const mix = value(
      substrateMix([
        { name: 'Saman', role: 'substrat', wetKg: 90, moisturePercent: 70 },
        { name: 'Kepek', role: 'katki', wetKg: 10, moisturePercent: 10 },
        { name: 'Su', role: 'su', wetKg: 20, moisturePercent: 100 },
        { name: 'Örtü toprağı', role: 'ortu_topragi', wetKg: 500, moisturePercent: 60 },
      ]),
    )
    assert.equal(mix.mixWetKg, 120)
    assert.equal(mix.mixDryKg, 36)
    assert.equal(mix.dryRatio, 0.3)
  })
  it('nemi eksik bileşen adıyla raporlanır', () =>
    assert.match(reason(substrateMix([{ name: 'Talaş', wetKg: 5, moisturePercent: undefined }])), /Talaş/))
})

describe('başlangıç kuru substrat tanımı (veri tabanı ile aynı)', () => {
  const materials = [
    { role: 'substrat' as const, wetKg: 90, moisturePercent: 70 },
    { role: 'katki' as const, wetKg: 10, moisturePercent: 10 },
    { role: 'su' as const, wetKg: 20, moisturePercent: 100 },
  ]
  it('birim dolumu varsa: dolum × karışım kuru oranı', () => {
    const r = value(initialSubstrate({ materials, unitCount: 100, perUnitKg: 1.2 }))
    assert.equal(r.totalWetKg, 120)
    assert.equal(r.totalDryKg, 36)
    assert.equal(r.method, 'dolum_x_karisim_kuru_orani')
  })
  it('birim dolumu yoksa: bileşen toplamı', () => {
    const r = value(initialSubstrate({ materials }))
    assert.equal(r.totalDryKg, 36)
    assert.equal(r.method, 'karisim_toplami')
  })
  it('dolum karışımdan fazlaysa uyarı verir', () => {
    const r = initialSubstrate({ materials, unitCount: 100, perUnitKg: 2 })
    assert.ok(r.ok && r.warnings.length === 1)
  })
})

describe('7.3 misel oranı', () => {
  it('yaş substrat bazında', () => assert.equal(value(spawnRate(10, 'yas', 200)), 5))
  it('kuru substrat bazında', () => assert.equal(value(spawnRate(3, 'kuru', 60)), 5))
  it('sıfıra bölme engellenir', () => assert.match(reason(spawnRate(3, 'kuru', 0)), /sıfır/))
})

describe('7.4 biyolojik etkinlik', () => {
  it('taze / kuru × 100', () => assert.equal(value(biologicalEfficiency(45, 60)), 75))
  it('%100 üstü geçerli kabul edilir', () => assert.equal(value(biologicalEfficiency(90, 60)), 150))
  it('kuru substrat bilinmiyorsa hesaplanamaz', () =>
    assert.match(reason(biologicalEfficiency(10, null)), /BE hesaplanamıyor/))
  it('kuru substrat sıfırsa hesaplanamaz', () => assert.match(reason(biologicalEfficiency(10, 0)), /sıfır/))
})

const harvests = [
  { flushNumber: 1, totalFreshKg: 20, harvestedAt: '2026-11-20' },
  { flushNumber: 1, totalFreshKg: 10, harvestedAt: '2026-11-21' }, // aynı flush, farklı gün
  { flushNumber: 2, totalFreshKg: 10, harvestedAt: '2026-12-05' },
]

describe('7.5–7.7 verim ve süre', () => {
  it('birim verimi', () => assert.equal(value(yieldPerUnit(40, 100)), 0.4))
  it('flush payları; aynı flush farklı günlerde toplanır', () => {
    const rows = value(flushShares(harvests))
    assert.deepEqual(
      rows.map((r) => [r.flushNumber, r.totalKg, r.harvestCount, r.sharePercent]),
      [
        [1, 30, 2, 75],
        [2, 10, 1, 25],
      ],
    )
  })
  it('ilk hasada kadar geçen gün', () => assert.equal(value(daysToFirstHarvest('2026-11-02', harvests)), 18))
  it('hasat inokülasyondan önceyse hata', () => assert.match(reason(daysToFirstHarvest('2026-12-30', harvests)), /önce/))
})

describe('7.8 kayıp oranı', () => {
  it('yalnızca yeni imha edilenler toplanır', () =>
    assert.deepEqual(value(lossRate([{ newlyDiscardedUnits: 5 }, { newlyDiscardedUnits: 3 }], 100)), {
      discarded: 8,
      percent: 8,
    }))
  it('başlangıç birimini aşan toplam reddedilir', () =>
    assert.match(reason(lossRate([{ newlyDiscardedUnits: 60 }, { newlyDiscardedUnits: 50 }], 100)), /çift sayım/))
})

describe('7.9–7.10 maliyet ve gelir', () => {
  const costs = productionCost([
    { category: 'substrat', amount: 1000 },
    { category: 'misel', amount: 500 },
    { category: 'misel', amount: 250 },
  ])
  it('kategori toplamları ve eksik kategoriler', () => {
    const c = value(costs)
    assert.equal(c.total, 1750)
    assert.equal(c.byCategory.misel, 750)
    assert.ok(c.missingCategories.includes('enerji'))
  })
  it('birim maliyet', () => assert.equal(value(unitCostPerKg(1750, 35)), 50))
  it('pazarlanabilir ürün sıfırsa birim maliyet hesaplanmaz', () => assert.match(reason(unitCostPerKg(100, 0)), /sıfır/))
  it('para birimi karışımı reddedilir', () =>
    assert.match(reason(productionCost([{ category: 'su', amount: 1, currency: 'EUR' }])), /para birim/))
  it('gelir ve kayıtlı katkı — asla net kâr olarak etiketlenmez', () => {
    const rev = value(salesRevenue([{ quantityKg: 30, unitPrice: 100 }]))
    assert.equal(rev, 3000)
    const k = value(contribution(rev, value(costs)))
    assert.equal(k.value, 1250)
    assert.equal(k.isNetProfit, false)
    assert.match(k.label, /eksik giderler/)
  })
})

describe('girdi dönüştürme', () => {
  it('virgüllü ondalık kabul edilir', () => assert.equal(toNumber('2,5'), 2.5))
  it('boş metin tanımsızdır', () => assert.equal(toNumber('  '), undefined))
})
