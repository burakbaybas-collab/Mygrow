import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRightLeft, Camera, CircleAlert, Layers, Receipt, Scale, Thermometer } from 'lucide-react'
import { useOrg } from '../context/OrgContext'
import { Notice, PageHeader } from '../components/ui'

export default function AddRecord() {
  const { canWrite } = useOrg()
  if (!canWrite) return <Notice tone="warn">Salt okunur yetkiyle kayıt ekleyemezsiniz.</Notice>
  return (
    <>
      <PageHeader title="Kayıt ekle" subtitle="Hangi kaydı girmek istiyorsunuz?" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Action to="/partiler/yeni" icon={<Layers className="size-6" />} title="Yeni üretim partisi" text="Adım adım parti, substrat ve birim kaydı" />
        <Action
          to="/partiler"
          icon={<ArrowRightLeft className="size-6" />}
          title="Aşama değişikliği"
          text="Partiyi açın → “Üretim Aşamaları” sekmesi → Aşama değiştir"
        />
        <Planned icon={<Thermometer className="size-6" />} title="İklim kaydı" stage={3} />
        <Planned icon={<Scale className="size-6" />} title="Hasat kaydı" stage={3} />
        <Planned icon={<Camera className="size-6" />} title="Fotoğraf yükle" stage={3} />
        <Planned icon={<CircleAlert className="size-6" />} title="Sorun / kontaminasyon bildir" stage={3} />
        <Planned icon={<Receipt className="size-6" />} title="Gider veya satış" stage={4} />
      </div>
    </>
  )
}

function Action({ to, icon, title, text }: { to: string; icon: ReactNode; title: string; text: string }) {
  return (
    <Link to={to} className="flex min-h-24 items-start gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-sm hover:border-secondary/60">
      <span className="rounded-xl bg-primary-soft p-2.5 text-primary">{icon}</span>
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm text-muted">{text}</span>
      </span>
    </Link>
  )
}

function Planned({ icon, title, stage }: { icon: ReactNode; title: string; stage: number }) {
  return (
    <div aria-disabled className="flex min-h-24 items-start gap-3 rounded-[var(--radius-card)] border border-dashed border-line p-4 text-muted">
      <span className="rounded-xl bg-canvas p-2.5">{icon}</span>
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm">Geliştirme aşaması {stage}'te eklenecek. Veri tabanı tablosu hazır.</span>
      </span>
    </div>
  )
}
