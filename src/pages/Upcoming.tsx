import { Card, Notice, PageHeader } from '../components/ui'

const MODULES = {
  analytics: {
    title: 'Analizler',
    stage: 5,
    items: [
      'Tür, suş, substrat reçetesi, yöntem, oda, parti ve tarih filtreleri',
      'Sıcaklık, bağıl nem ve CO₂ zaman grafikleri',
      'Flush bazında hasat, partilere göre BE, suş ve reçetelere göre verim',
      'Üretim maliyetleri ve aylık hasat grafikleri',
      'Örnek (demo) verilerin gerçek sonuçlardan ayrı tutulması',
    ],
    note: 'Tek bir partinin BE, birim verimi, ilk hasat süresi ve flush payları şimdiden parti detayındaki “Analizler” sekmesinde gerçek kayıtlardan hesaplanır.',
  },
  reports: {
    title: 'Raporlar',
    stage: 5,
    items: ['CSV ve Excel dışa aktarma', 'Parti ve dönem raporları', 'PDF raporu (sonraki sürüm)'],
    note: null,
  },
  alerts: {
    title: 'Bildirimler ve uyarılar',
    stage: 5,
    items: ['Protokol aralığı dışındaki iklim ölçümleri için kural tabanlı uyarılar', 'Uzun süredir kayıt girilmeyen partiler'],
    note: 'Ana sayfadaki “Kontrol gerektiren” kartı, son kaydı 7 günden eski aktif partileri şimdiden gerçek verilerle gösterir.',
  },
} as const

/** Henüz geliştirilmemiş modüller için dürüst bilgilendirme sayfası (sahte grafik veya veri yok). */
export default function Upcoming({ module }: { module: keyof typeof MODULES }) {
  const m = MODULES[module]
  return (
    <>
      <PageHeader title={m.title} />
      <Card>
        <Notice tone="info" title={`Bu modül geliştirme planının ${m.stage}. aşamasında eklenecek`}>
          Bu ekranda şu anda gösterilen bir grafik veya hesaplama yoktur. Planlanan içerik:
        </Notice>
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm">
          {m.items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
        {m.note && <p className="mt-4 text-sm text-muted">{m.note}</p>}
      </Card>
    </>
  )
}
