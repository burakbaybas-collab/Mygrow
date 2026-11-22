import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Camera, CircleAlert, Clock, Layers, Plus, Scale, Sprout, Thermometer, TriangleAlert, Wheat } from 'lucide-react'
import { db } from '../lib/supabase'
import { unwrap, useAsync } from '../lib/useAsync'
import { useOrg, useOrgId } from '../context/OrgContext'
import { displayNameOf, useAuth } from '../context/AuthContext'
import { daysSince } from '../lib/calc'
import { fmtDate, fmtKg } from '../lib/format'
import { label } from '../i18n'
import type { Batch } from '../lib/types'
import { Badge, Card, EmptyState, ErrorBox, LinkButton, PageHeader, SciName, SectionTitle, Spinner, StatCard } from '../components/ui'

/** Son kaydı bu kadar günden eski olan aktif partiler "kontrol gerektiren" sayılır. */
export const STALE_DAYS = 7

const DAY = 86_400_000

interface DashboardData {
  batches: Batch[]
  harvestByBatch: Map<string, number>
  harvest30: number
  openIssues: number
}

async function loadDashboard(orgId: string): Promise<DashboardData> {
  const client = db()
  const since = new Date(Date.now() - 30 * DAY).toISOString()

  const batches = unwrap(
    await client
      .from('batches')
      .select(
        'id, batch_code, start_date, inoculation_date, status, current_stage_name, current_stage_category, last_record_at, unit_count, is_demo, cultivation_method, species:species(id, scientific_name, turkish_name, is_species_group), strain:strains(id, code, name, identity_status, exact_species_name), room:rooms(id, name)',
      )
      .eq('organization_id', orgId)
      .eq('status', 'aktif')
      .order('start_date', { ascending: false }),
  ) as unknown as Batch[]

  const ids = batches.map((b) => b.id)
  const [batchHarvests, recent, issues] = await Promise.all([
    ids.length
      ? client.from('harvests').select('batch_id, total_fresh_kg').in('batch_id', ids)
      : Promise.resolve({ data: [], error: null }),
    client.from('harvests').select('total_fresh_kg').eq('organization_id', orgId).gte('harvested_at', since),
    client
      .from('loss_events')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('is_resolved', false),
  ])

  const harvestByBatch = new Map<string, number>()
  for (const h of unwrap(batchHarvests) as { batch_id: string; total_fresh_kg: number }[]) {
    harvestByBatch.set(h.batch_id, (harvestByBatch.get(h.batch_id) ?? 0) + Number(h.total_fresh_kg))
  }
  const harvest30 = (unwrap(recent) as { total_fresh_kg: number }[]).reduce((a, h) => a + Number(h.total_fresh_kg), 0)
  if (issues.error) throw issues.error

  return { batches, harvestByBatch, harvest30, openIssues: issues.count ?? 0 }
}

export default function Dashboard() {
  const orgId = useOrgId()
  const { current, canWrite } = useOrg()
  const { user } = useAuth()
  const { data, error, loading, reload } = useAsync(() => loadDashboard(orgId), [orgId])

  const name = current?.display_name || displayNameOf(user)

  return (
    <>
      <PageHeader
        title={`Merhaba${name ? `, ${name}` : ''}`}
        subtitle={`${current?.organization?.name ?? ''} — üretim kontrol paneli`}
        actions={
          canWrite && (
            <LinkButton to="/partiler/yeni" icon={<Plus className="size-4" />}>
              Yeni Parti Oluştur
            </LinkButton>
          )
        }
      />

      {loading && <Spinner />}
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}

      {data && <DashboardBody data={data} canWrite={canWrite} />}
    </>
  )
}

function DashboardBody({ data, canWrite }: { data: DashboardData; canWrite: boolean }) {
  const { batches, harvestByBatch, harvest30, openIssues } = data
  const incubating = batches.filter((b) => b.current_stage_category === 'inkubasyon').length
  const nearHarvest = batches.filter((b) => b.current_stage_category === 'primordium' || b.current_stage_category === 'fruktifikasyon').length
  const stale = batches.filter((b) => (daysSince(b.last_record_at) ?? 0) >= STALE_DAYS)
  const hasDemo = batches.some((b) => b.is_demo)

  return (
    <div className="space-y-6">
      {hasDemo && (
        <Badge tone="warn">Bu listede “örnek veri” olarak işaretlenmiş partiler var; analizlerde gerçek veriden ayrı tutulur.</Badge>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Aktif üretim partisi" value={batches.length} icon={<Layers className="size-4" />} tone="green" />
        <StatCard label="İnkübasyondaki partiler" value={incubating} icon={<Sprout className="size-4" />} tone="green" />
        <StatCard
          label="Hasada yaklaşan"
          value={nearHarvest}
          hint="Primordium veya fruktifikasyon aşamasında"
          icon={<Wheat className="size-4" />}
          tone="green"
        />
        <StatCard label="Son 30 gün hasat" value={fmtKg(harvest30, 1)} icon={<Scale className="size-4" />} tone="green" />
        <StatCard label="Açık üretim sorunu" value={openIssues} icon={<CircleAlert className="size-4" />} tone={openIssues ? 'danger' : 'neutral'} />
        <StatCard
          label="Kontrol gerektiren"
          value={stale.length}
          hint={`Son kaydı ${STALE_DAYS}+ gün önce olan aktif partiler`}
          icon={<TriangleAlert className="size-4" />}
          tone={stale.length ? 'warn' : 'neutral'}
        />
      </div>

      <Card>
        <SectionTitle>Hızlı işlemler</SectionTitle>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {canWrite && (
            <LinkButton to="/partiler/yeni" icon={<Plus className="size-4" />}>
              Yeni Parti
            </LinkButton>
          )}
          <QuickPlanned icon={<Thermometer className="size-4" />} label="İklim Kaydı Ekle" />
          <QuickPlanned icon={<Scale className="size-4" />} label="Hasat Gir" />
          <QuickPlanned icon={<Camera className="size-4" />} label="Fotoğraf Yükle" />
          <QuickPlanned icon={<CircleAlert className="size-4" />} label="Sorun Bildir" />
        </div>
        <p className="mt-3 text-xs text-muted">
          İklim, hasat, fotoğraf ve sorun kayıt formları geliştirme planının 3. aşamasında etkinleşecek. Veri tabanı tabloları hazırdır.
        </p>
      </Card>

      <section>
        <SectionTitle action={<Link to="/partiler" className="text-sm font-medium text-primary">Tümü</Link>}>Aktif üretimler</SectionTitle>
        {batches.length === 0 ? (
          <EmptyState
            icon={<Layers className="size-10" />}
            title="Henüz aktif üretim partisi yok"
            action={canWrite && <LinkButton to="/partiler/yeni">İlk partiyi oluştur</LinkButton>}
          >
            Parti oluşturmadan önce “Tesis ve Odalar” bölümünden en az bir tesis tanımlayın.
          </EmptyState>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {batches.map((b) => (
              <BatchCard key={b.id} batch={b} harvestKg={harvestByBatch.get(b.id) ?? 0} stale={(daysSince(b.last_record_at) ?? 0) >= STALE_DAYS} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function QuickPlanned({ icon, label: text }: { icon: ReactNode; label: string }) {
  return (
    <button
      type="button"
      disabled
      title="Aşama 3'te etkinleşecek"
      className="inline-flex min-h-11 cursor-not-allowed flex-col items-center justify-center gap-0.5 rounded-xl border border-dashed border-line px-3 py-1.5 text-sm text-muted"
    >
      <span className="inline-flex items-center gap-2">
        {icon}
        {text}
      </span>
      <span className="text-[10px]">Yakında</span>
    </button>
  )
}

export function BatchCard({ batch: b, harvestKg, stale }: { batch: Batch; harvestKg?: number; stale?: boolean }) {
  const days = daysSince(b.inoculation_date ?? b.start_date)
  return (
    <Link to={`/partiler/${b.id}`} className="block rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-sm transition hover:border-secondary/60">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold">{b.batch_code}</p>
          <p className="truncate text-sm">
            {b.species ? <SciName name={b.species.scientific_name} /> : '—'}
            {b.species?.turkish_name && <span className="text-muted"> · {b.species.turkish_name}</span>}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge tone="green">{b.current_stage_name ?? 'Aşama yok'}</Badge>
          {b.is_demo && <Badge tone="warn">Örnek veri</Badge>}
          {stale && <Badge tone="warn">Kontrol gerekli</Badge>}
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
        <Item k="Suş / izolat" v={b.strain ? b.strain.code : '—'} />
        <Item k="Oda" v={b.room?.name ?? '—'} />
        <Item k="Başlangıç" v={fmtDate(b.start_date)} />
        <Item k={b.inoculation_date ? 'İnokülasyondan beri' : 'Başlangıçtan beri'} v={days === null ? '—' : `${days} gün`} />
        <Item k="Yöntem" v={label('methods', b.cultivation_method)} />
        <Item k="Toplam hasat" v={fmtKg(harvestKg ?? 0, 2)} />
      </dl>
      <p className="mt-3 flex items-center gap-1 text-[11px] text-muted">
        <Clock className="size-3" /> Son kayıt: {fmtDate(b.last_record_at)}
      </p>
    </Link>
  )
}

function Item({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted">{k}</dt>
      <dd className="truncate font-medium">{v}</dd>
    </div>
  )
}
