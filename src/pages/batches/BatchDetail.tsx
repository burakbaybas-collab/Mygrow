import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Archive, ArrowLeft, CircleCheck, RotateCcw, Trash2, ArrowRightLeft } from 'lucide-react'
import { db } from '../../lib/supabase'
import { unwrap, useAsync } from '../../lib/useAsync'
import { friendlyError } from '../../lib/errors'
import { useOrg } from '../../context/OrgContext'
import { biologicalEfficiency, daysSince, daysToFirstHarvest, flushShares, totalHarvest, yieldPerUnit } from '../../lib/calc'
import { fmtDate, fmtDateTime, fmtKg, fmtNumber, fmtPercent, nowLocalInput } from '../../lib/format'
import { label, options } from '../../i18n'
import type { Batch, BatchMaterial, HarvestRow, StageCategory, StageHistory } from '../../lib/types'
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DefinitionList,
  ErrorBox,
  Field,
  Input,
  Modal,
  Notice,
  PageHeader,
  SciName,
  Select,
  Spinner,
  Textarea,
  cx,
} from '../../components/ui'
import { useToast } from '../../components/Toast'

const TABS = [
  { key: 'genel', label: 'Genel Bilgiler' },
  { key: 'asamalar', label: 'Üretim Aşamaları' },
  { key: 'iklim', label: 'İklim Verileri', planned: 3 },
  { key: 'foto', label: 'Fotoğraf Galerisi', planned: 3 },
  { key: 'hasat', label: 'Hasat Kayıtları', planned: 3 },
  { key: 'sorun', label: 'Sorun ve Kontaminasyon', planned: 3 },
  { key: 'maliyet', label: 'Maliyetler', planned: 4 },
  { key: 'analiz', label: 'Analizler' },
] as const
type TabKey = (typeof TABS)[number]['key']

interface DetailData {
  batch: Batch
  materials: BatchMaterial[]
  history: StageHistory[]
  harvests: HarvestRow[]
}

async function loadDetail(id: string): Promise<DetailData> {
  const c = db()
  const [b, m, h, hv] = await Promise.all([
    c
      .from('batches')
      .select(
        '*, species:species(id, scientific_name, turkish_name, is_species_group), strain:strains(id, code, name, identity_status, exact_species_name), room:rooms(id, name), facility:facilities(id, name)',
      )
      .eq('id', id)
      .single(),
    c.from('batch_materials').select('*').eq('batch_id', id).order('sort_order'),
    c.from('batch_stage_history').select('*').eq('batch_id', id).order('started_at', { ascending: true }),
    c.from('harvests').select('id, batch_id, harvested_at, flush_number, total_fresh_kg, marketable_kg, cull_kg').eq('batch_id', id).order('harvested_at'),
  ])
  return {
    batch: unwrap(b) as unknown as Batch,
    materials: unwrap(m) as BatchMaterial[],
    history: unwrap(h) as StageHistory[],
    harvests: unwrap(hv) as HarvestRow[],
  }
}

export default function BatchDetail() {
  const { id = '' } = useParams()
  const { data, error, loading, reload } = useAsync(() => loadDetail(id), [id])
  const [tab, setTab] = useState<TabKey>('genel')

  if (loading && !data) return <Spinner />
  if (error || !data) return <ErrorBox message={error ?? 'Parti bulunamadı'} onRetry={() => void reload()} />

  const { batch } = data
  return (
    <>
      <PageHeader
        back={
          <Link to="/partiler" className="mb-1 inline-flex items-center gap-1 text-sm text-muted">
            <ArrowLeft className="size-4" /> Partiler
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-2">
            {batch.batch_code}
            <Badge tone={batch.status === 'aktif' ? 'green' : 'neutral'}>{label('batchStatus', batch.status)}</Badge>
            {batch.is_demo && <Badge tone="warn">Örnek veri</Badge>}
          </span>
        }
        subtitle={
          <>
            {batch.species && <SciName name={batch.species.scientific_name} />}
            {batch.species?.turkish_name && ` · ${batch.species.turkish_name}`} · {label('methods', batch.cultivation_method)}
          </>
        }
        actions={<BatchActions batch={batch} onChanged={reload} />}
      />

      <div className="-mx-4 mb-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
        <div role="tablist" className="flex w-max gap-1 rounded-xl border border-line bg-surface p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cx(
                'whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium',
                tab === t.key ? 'bg-primary text-white' : 'text-muted hover:bg-canvas',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'genel' && <GeneralTab data={data} />}
      {tab === 'asamalar' && <StagesTab data={data} onChanged={reload} />}
      {tab === 'analiz' && <AnalysisTab data={data} />}
      {TABS.map(
        (t) =>
          tab === t.key &&
          'planned' in t && (
            <Card key={t.key}>
              <Notice tone="info" title={`${t.label} — geliştirme aşaması ${t.planned}`}>
                Bu sekmenin veri tabanı tablosu hazır ve işletme bazlı yetkilerle korunuyor; kayıt formu ve listesi geliştirme
                planının {t.planned}. aşamasında eklenecek. Şu anda bu sekmede gösterilecek ya da girilebilecek kayıt yoktur.
              </Notice>
            </Card>
          ),
      )}
    </>
  )
}

// ---------------------------------------------------------------- Eylemler
function BatchActions({ batch, onChanged }: { batch: Batch; onChanged: () => Promise<void> }) {
  const { canWrite, canManage } = useOrg()
  const toast = useToast()
  const navigate = useNavigate()
  const [confirm, setConfirm] = useState<null | 'complete' | 'archive' | 'reopen' | 'delete'>(null)
  const [busy, setBusy] = useState(false)
  const [deleteText, setDeleteText] = useState('')

  async function setStatus(status: Batch['status']) {
    setBusy(true)
    const { error } = await db().from('batches').update({ status }).eq('id', batch.id)
    setBusy(false)
    setConfirm(null)
    if (error) return toast.error(friendlyError(error))
    toast.success(status === 'tamamlandi' ? 'Parti tamamlandı.' : status === 'arsivlendi' ? 'Parti arşivlendi.' : 'Parti yeniden aktif.')
    await onChanged()
  }

  async function remove() {
    setBusy(true)
    const { error } = await db().from('batches').delete().eq('id', batch.id)
    setBusy(false)
    if (error) {
      setConfirm(null)
      return toast.error(friendlyError(error))
    }
    toast.success('Parti ve ilişkili kayıtları silindi.')
    navigate('/partiler', { replace: true })
  }

  return (
    <>
      {batch.status === 'aktif' && canWrite && (
        <Button variant="secondary" icon={<CircleCheck className="size-4" />} onClick={() => setConfirm('complete')}>
          Tamamla
        </Button>
      )}
      {batch.status !== 'arsivlendi' && canManage && (
        <Button variant="secondary" icon={<Archive className="size-4" />} onClick={() => setConfirm('archive')}>
          Arşivle
        </Button>
      )}
      {batch.status !== 'aktif' && canManage && (
        <Button variant="secondary" icon={<RotateCcw className="size-4" />} onClick={() => setConfirm('reopen')}>
          Yeniden aç
        </Button>
      )}
      {canManage && (
        <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => setConfirm('delete')} aria-label="Partiyi sil">
          Sil
        </Button>
      )}

      <ConfirmDialog
        open={confirm === 'complete'}
        title="Partiyi tamamla"
        message="Tamamlanan partide aşama değiştirilemez. Sonradan düzeltmeyi yalnızca işletme sahibi veya yönetici yapabilir. Geçmiş kayıtlar korunur."
        confirmLabel="Tamamla"
        loading={busy}
        onConfirm={() => void setStatus('tamamlandi')}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'archive'}
        title="Partiyi arşivle"
        message="Arşivlenen parti aktif listelerden kalkar; kayıtları silinmez ve analizlerde kullanılmaya devam eder."
        confirmLabel="Arşivle"
        loading={busy}
        onConfirm={() => void setStatus('arsivlendi')}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'reopen'}
        title="Partiyi yeniden aç"
        message="Parti tekrar aktif duruma getirilecek."
        confirmLabel="Yeniden aç"
        loading={busy}
        onConfirm={() => void setStatus('aktif')}
        onCancel={() => setConfirm(null)}
      />
      <Modal
        open={confirm === 'delete'}
        onClose={() => setConfirm(null)}
        title="Partiyi kalıcı olarak sil"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              Vazgeç
            </Button>
            <Button variant="danger" loading={busy} disabled={deleteText.trim() !== batch.batch_code} onClick={() => void remove()}>
              Kalıcı olarak sil
            </Button>
          </>
        }
      >
        <Notice tone="danger" title="Bu işlem geri alınamaz">
          Partiyle birlikte substrat bileşenleri, aşama geçmişi, iklim, hasat, sorun, maliyet, satış ve fotoğraf kayıtları da
          silinir. Kayıtları korumak istiyorsanız silmek yerine <b>arşivleyin</b>.
        </Notice>
        <Field label={`Onaylamak için parti kodunu yazın: ${batch.batch_code}`} className="mt-4">
          <Input value={deleteText} onChange={(e) => setDeleteText(e.target.value)} />
        </Field>
      </Modal>
    </>
  )
}

// ---------------------------------------------------------------- Genel
function GeneralTab({ data }: { data: DetailData }) {
  const { batch: b, materials } = data
  const initial = materials.filter((m) => ['substrat', 'katki', 'su'].includes(m.role))
  const later = materials.filter((m) => !['substrat', 'katki', 'su'].includes(m.role))
  const strain = b.strain
  return (
    <div className="space-y-4">
      <Card>
        <h2 className="mb-3 font-semibold">Parti bilgileri</h2>
        <DefinitionList
          items={[
            { label: 'Parti kodu', value: b.batch_code },
            { label: 'Tür', value: b.species ? <SciName name={b.species.scientific_name} /> : '—' },
            {
              label: 'Suş / izolat',
              value: strain ? (
                <>
                  {strain.code}
                  {strain.name ? ` — ${strain.name}` : ''}{' '}
                  <Badge tone={strain.identity_status === 'dogrulanmis' ? 'green' : 'warn'}>{label('identity', strain.identity_status)}</Badge>
                  {strain.exact_species_name && (
                    <span className="block text-xs text-muted">
                      Kesin tür: <SciName name={strain.exact_species_name} />
                    </span>
                  )}
                </>
              ) : (
                'Belirtilmedi'
              ),
            },
            { label: 'Üretim yöntemi', value: label('methods', b.cultivation_method) },
            { label: 'Tesis', value: b.facility?.name },
            { label: 'Üretim odası', value: b.room?.name ?? 'Belirtilmedi' },
            { label: 'Sorumlu', value: b.responsible_name ?? '—' },
            { label: 'Başlangıç tarihi', value: fmtDate(b.start_date) },
            { label: 'İnokülasyon tarihi', value: fmtDate(b.inoculation_date) },
            { label: 'Geçen gün (inokülasyon/başlangıç)', value: `${daysSince(b.inoculation_date ?? b.start_date) ?? '—'} gün` },
            {
              label: 'Protokol',
              value: b.protocol_snapshot
                ? `${b.protocol_snapshot.protocol.name} — s${b.protocol_snapshot.protocol.version} (${label('verification', b.protocol_snapshot.protocol.verification_status)})`
                : 'Yok',
            },
            { label: 'Mevcut aşama', value: b.current_stage_name ?? '—' },
            { label: 'Tamamlanma', value: b.completed_at ? fmtDateTime(b.completed_at) : '—' },
            { label: 'Açıklamalar', value: b.notes ?? '—' },
          ]}
        />
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">Substrat ve üretim birimleri</h2>
        <DefinitionList
          items={[
            { label: 'Reçete', value: b.recipe_name ? `${b.recipe_name}${b.recipe_version ? ` (s${b.recipe_version})` : ''}` : 'Reçetesiz' },
            { label: 'İşlem', value: b.treatment_method ? `${label('treatments', b.treatment_method)} · ${fmtDate(b.treatment_date)}` : '—' },
            { label: 'Birim', value: b.unit_count ? `${fmtNumber(b.unit_count)} ${b.unit_type ?? 'birim'} × ${fmtKg(b.wet_substrate_per_unit_kg, 3)}` : 'Girilmedi' },
            { label: 'Toplam yaş substrat', value: fmtKg(b.total_wet_substrate_kg, 3) },
            {
              label: 'Başlangıç kuru substrat',
              value: b.total_dry_substrate_kg !== null ? fmtKg(b.total_dry_substrate_kg, 3) : 'Hesaplanamadı (bileşen nemi eksik)',
            },
            {
              label: 'Misel',
              value:
                b.spawn_weight_kg !== null
                  ? `${fmtKg(b.spawn_weight_kg, 3)} · ${b.spawn_rate_percent !== null ? fmtPercent(b.spawn_rate_percent, 2) : 'oran hesaplanamadı'} (${label('spawnBasis', b.spawn_rate_basis)})`
                  : 'Girilmedi',
            },
            { label: 'Substrat pH', value: fmtNumber(b.substrate_ph, 2) },
            { label: 'Substrat notları', value: b.substrate_notes ?? '—' },
          ]}
        />
        {b.dry_substrate_method && (
          <p className="mt-3 text-xs text-muted">
            Kuru substrat yöntemi:{' '}
            {b.dry_substrate_method === 'dolum_x_karisim_kuru_orani'
              ? 'birim dolumu × karışımın kuru madde oranı'
              : 'bileşen kuru ağırlıklarının toplamı'}
          </p>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">Başlangıç substratı bileşenleri</h2>
        <MaterialTable rows={initial} />
        {later.length > 0 && (
          <>
            <h3 className="mb-2 mt-5 text-sm font-semibold">Örtü toprağı ve sonradan eklenenler (BE paydasına dahil değil)</h3>
            <MaterialTable rows={later} />
          </>
        )}
      </Card>
    </div>
  )
}

function MaterialTable({ rows }: { rows: BatchMaterial[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted">Kayıt yok.</p>
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            <th className="py-2 pr-2 font-medium">Bileşen</th>
            <th className="py-2 pr-2 font-medium">Rol</th>
            <th className="py-2 pr-2 text-right font-medium">Yaş (kg)</th>
            <th className="py-2 pr-2 text-right font-medium">Nem (%)</th>
            <th className="py-2 text-right font-medium">Kuru (kg)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.id} className="border-b border-line/60">
              <td className="py-2 pr-2">{m.component_name}</td>
              <td className="py-2 pr-2 text-muted">{label('materialRoles', m.role)}</td>
              <td className="py-2 pr-2 text-right">{fmtNumber(m.wet_weight_kg, 3)}</td>
              <td className="py-2 pr-2 text-right">{fmtNumber(m.moisture_percent, 1)}</td>
              <td className="py-2 text-right">{fmtNumber(m.dry_weight_kg, 3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------- Aşamalar
function StagesTab({ data, onChanged }: { data: DetailData; onChanged: () => Promise<void> }) {
  const { batch, history } = data
  const { canWrite } = useOrg()
  const [open, setOpen] = useState(false)
  const snapshotStages = batch.protocol_snapshot?.stages ?? []
  const currentOrder = history.at(-1)?.stage_order ?? null

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card>
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="font-semibold">Zaman çizelgesi</h2>
          {canWrite && batch.status === 'aktif' && (
            <Button size="sm" icon={<ArrowRightLeft className="size-4" />} onClick={() => setOpen(true)}>
              Aşama değiştir
            </Button>
          )}
        </div>
        {history.length === 0 ? (
          <p className="text-sm text-muted">Henüz aşama kaydı yok.</p>
        ) : (
          <ol className="relative ml-2 border-l-2 border-line">
            {history.map((h) => {
              const end = h.ended_at ? new Date(h.ended_at) : new Date()
              const days = Math.max(0, Math.round((end.getTime() - new Date(h.started_at).getTime()) / 86_400_000))
              return (
                <li key={h.id} className="mb-5 ml-5">
                  <span
                    className={cx(
                      'absolute -left-[9px] mt-1 size-4 rounded-full border-2 border-surface',
                      h.ended_at ? 'bg-secondary' : 'bg-primary ring-4 ring-primary-soft',
                    )}
                  />
                  <p className="font-medium">
                    {h.stage_name} <span className="text-xs font-normal text-muted">· {label('stageCategories', h.category)}</span>
                  </p>
                  <p className="text-xs text-muted">
                    {fmtDateTime(h.started_at)} → {h.ended_at ? fmtDateTime(h.ended_at) : 'devam ediyor'} · {days} gün
                  </p>
                  {h.notes && <p className="mt-1 text-sm">{h.notes}</p>}
                </li>
              )
            })}
          </ol>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">Protokol aşamaları</h2>
        {snapshotStages.length === 0 ? (
          <p className="text-sm text-muted">Bu partiye protokol bağlanmadı; aşamalar serbest olarak girilir.</p>
        ) : (
          <>
            <p className="mb-3 text-xs text-muted">
              Parti oluşturulduğu andaki protokol kaydıdır; protokol sonradan değişse de bu liste değişmez.
            </p>
            <ol className="space-y-2 text-sm">
              {snapshotStages.map((s) => (
                <li
                  key={s.id}
                  className={cx('rounded-lg px-3 py-2', s.stage_order === currentOrder ? 'bg-primary-soft font-medium text-primary' : 'bg-canvas')}
                >
                  {s.stage_order}. {s.name}
                  <StageTargets s={s} />
                </li>
              ))}
            </ol>
          </>
        )}
      </Card>

      {open && <ChangeStageModal open={open} onClose={() => setOpen(false)} batch={batch} history={history} onChanged={onChanged} />}
    </div>
  )
}

function StageTargets({ s }: { s: NonNullable<Batch['protocol_snapshot']>['stages'][number] }) {
  const parts: string[] = []
  const range = (a: number | null, b: number | null, unit: string) =>
    a === null && b === null ? null : `${a ?? '…'}–${b ?? '…'} ${unit}`
  const t = range(s.air_temp_min, s.air_temp_max, '°C')
  const rh = range(s.rh_min, s.rh_max, '% BN')
  const co2 = range(s.co2_min, s.co2_max, 'ppm CO₂')
  for (const p of [t, rh, co2]) if (p) parts.push(p)
  return (
    <span className="mt-0.5 block text-xs font-normal text-muted">
      {parts.length ? parts.join(' · ') : 'Hedef değer tanımlanmamış'}
    </span>
  )
}

function ChangeStageModal({
  open,
  onClose,
  batch,
  history,
  onChanged,
}: {
  open: boolean
  onClose: () => void
  batch: Batch
  history: StageHistory[]
  onChanged: () => Promise<void>
}) {
  const toast = useToast()
  const stages = batch.protocol_snapshot?.stages ?? []
  const lastOrder = history.at(-1)?.stage_order ?? 0
  const nextStage = stages.find((s) => s.stage_order > (lastOrder ?? 0))
  const [choice, setChoice] = useState<string>(nextStage?.id ?? (stages.length ? stages[0].id : 'custom'))
  const [customName, setCustomName] = useState('')
  const [customCat, setCustomCat] = useState<StageCategory>('diger')
  const [startedAt, setStartedAt] = useState(nowLocalInput())
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    setErr(null)
    const st = stages.find((s) => s.id === choice)
    const name = st ? st.name : customName.trim()
    if (!name) return setErr('Aşama adı girin.')
    if (!startedAt) return setErr('Başlangıç zamanı girin.')
    setBusy(true)
    const { error } = await db().rpc('change_batch_stage', {
      p_batch_id: batch.id,
      p_stage_name: name,
      p_category: st ? st.category : customCat,
      p_stage_order: st ? st.stage_order : null,
      p_protocol_stage_id: st ? st.id : null,
      p_started_at: new Date(startedAt).toISOString(),
      p_notes: notes || null,
    })
    setBusy(false)
    if (error) return setErr(friendlyError(error))
    toast.success(`Aşama “${name}” olarak güncellendi.`)
    onClose()
    await onChanged()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Aşama değiştir"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button loading={busy} onClick={() => void save()}>
            Kaydet
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {err && <Notice tone="danger">{err}</Notice>}
        <Field label="Yeni aşama">
          <Select value={choice} onChange={(e) => setChoice(e.target.value)}>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.stage_order}. {s.name}
              </option>
            ))}
            <option value="custom">Protokol dışı aşama…</option>
          </Select>
        </Field>
        {choice === 'custom' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Aşama adı" required>
              <Input value={customName} onChange={(e) => setCustomName(e.target.value)} />
            </Field>
            <Field label="Kategori" hint="Panodaki sayımlar için kullanılır.">
              <Select value={customCat} onChange={(e) => setCustomCat(e.target.value as StageCategory)}>
                {options('stageCategories').map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}
        <Field label="Başlangıç zamanı" hint="Önceki aşama bu zamanda kapatılır.">
          <Input type="datetime-local" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} />
        </Field>
        <Field label="Not">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- Analiz
function AnalysisTab({ data }: { data: DetailData }) {
  const { batch, harvests } = data
  const hv = harvests.map((h) => ({
    flushNumber: h.flush_number,
    totalFreshKg: Number(h.total_fresh_kg),
    harvestedAt: h.harvested_at,
  }))
  const total = totalHarvest(hv)
  const totalKg = total.ok ? total.value : undefined
  const be = biologicalEfficiency(totalKg, batch.total_dry_substrate_kg === null ? null : Number(batch.total_dry_substrate_kg))
  const perUnit = yieldPerUnit(totalKg, batch.unit_count)
  const first = daysToFirstHarvest(batch.inoculation_date, hv)
  const flush = flushShares(hv)

  const show = (r: { ok: boolean; reason?: string; value?: unknown }, fmt: (v: number) => string) =>
    r.ok ? fmt(r.value as number) : <span className="text-sm font-normal text-muted">{r.reason}</span>

  return (
    <div className="space-y-4">
      {batch.is_demo && <Notice tone="warn">Bu parti örnek veri olarak işaretli; sonuçlar gerçek üretim karşılaştırmalarına katılmaz.</Notice>}
      {harvests.length === 0 && (
        <Notice tone="info">
          Bu partide henüz hasat kaydı yok. Hasat girişi Aşama 3'te etkinleştiğinde bu hesaplar gerçek kayıtlardan otomatik oluşur.
        </Notice>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric title="Toplam taze hasat" value={show(total, (v) => fmtKg(v, 2))} />
        <Metric title="Biyolojik etkinlik (BE)" value={show(be, (v) => fmtPercent(v, 1))} note="%100 üzeri değerler geçerlidir (taze/kuru)." />
        <Metric title="Birim verimi" value={show(perUnit, (v) => `${fmtNumber(v, 3)} kg/birim`)} />
        <Metric title="İlk hasada kadar" value={show(first, (v) => `${v} gün`)} />
      </div>
      {flush.ok && (
        <Card>
          <h2 className="mb-3 font-semibold">Flush bazında verim</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="py-2 font-medium">Flush</th>
                <th className="py-2 text-right font-medium">Hasat sayısı</th>
                <th className="py-2 text-right font-medium">Miktar</th>
                <th className="py-2 text-right font-medium">Pay</th>
              </tr>
            </thead>
            <tbody>
              {flush.value.map((f) => (
                <tr key={f.flushNumber} className="border-b border-line/60">
                  <td className="py-2">{f.flushNumber}. flush</td>
                  <td className="py-2 text-right">{f.harvestCount}</td>
                  <td className="py-2 text-right">{fmtKg(f.totalKg, 2)}</td>
                  <td className="py-2 text-right">{fmtPercent(f.sharePercent, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}

function Metric({ title, value, note }: { title: string; value: ReactNode; note?: string }) {
  return (
    <Card>
      <p className="text-xs text-muted">{title}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
      {note && <p className="mt-1 text-[11px] text-muted">{note}</p>}
    </Card>
  )
}
