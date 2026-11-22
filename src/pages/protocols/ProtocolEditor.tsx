import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowDown, ArrowLeft, ArrowUp, Copy, Plus, Trash2 } from 'lucide-react'
import { db } from '../../lib/supabase'
import { unwrap, useAsync } from '../../lib/useAsync'
import { friendlyError } from '../../lib/errors'
import { useOrg, useOrgId } from '../../context/OrgContext'
import { label, options } from '../../i18n'
import type { Protocol, ProtocolStage, Species, Strain } from '../../lib/types'
import { Badge, Button, Card, ErrorBox, Field, Input, LinkButton, Notice, PageHeader, Select, Spinner, Textarea } from '../../components/ui'
import { useToast } from '../../components/Toast'
import { emptyToUndefinedNumber } from '../batches/batchSchema'

const n = z.preprocess(emptyToUndefinedNumber, z.number({ invalid_type_error: 'Sayı girin' }).optional())

const RANGES = [
  ['duration_days_min', 'duration_days_max', 'Süre (gün)'],
  ['air_temp_min', 'air_temp_max', 'Hava sıcaklığı (°C)'],
  ['substrate_temp_min', 'substrate_temp_max', 'Substrat sıcaklığı (°C)'],
  ['rh_min', 'rh_max', 'Bağıl nem (%)'],
  ['co2_min', 'co2_max', 'CO₂ (ppm)'],
  ['light_lux_min', 'light_lux_max', 'Işık (lux)'],
] as const

const stageSchema = z
  .object({
    name: z.string().trim().min(1, 'Aşama adı girin').max(200),
    category: z.string(),
    duration_days_min: n,
    duration_days_max: n,
    air_temp_min: n,
    air_temp_max: n,
    substrate_temp_min: n,
    substrate_temp_max: n,
    rh_min: n,
    rh_max: n,
    co2_min: n,
    co2_max: n,
    light_lux_min: n,
    light_lux_max: n,
    light_hours_per_day: n,
    notes: z.string().max(2000).optional(),
  })
  .superRefine((s, ctx) => {
    for (const [a, b, l] of RANGES) {
      const lo = s[a]
      const hi = s[b]
      if (lo !== undefined && hi !== undefined && lo > hi) ctx.addIssue({ code: 'custom', path: [b], message: `${l}: en yüksek değer en düşükten küçük` })
    }
    for (const k of ['rh_min', 'rh_max'] as const) {
      const v = s[k]
      if (v !== undefined && (v < 0 || v > 100)) ctx.addIssue({ code: 'custom', path: [k], message: 'Nem 0–100 arasında olmalı' })
    }
    for (const k of ['duration_days_min', 'duration_days_max', 'co2_min', 'co2_max', 'light_lux_min', 'light_lux_max'] as const) {
      const v = s[k]
      if (v !== undefined && v < 0) ctx.addIssue({ code: 'custom', path: [k], message: 'Negatif olamaz' })
    }
    if (s.light_hours_per_day !== undefined && (s.light_hours_per_day < 0 || s.light_hours_per_day > 24)) {
      ctx.addIssue({ code: 'custom', path: ['light_hours_per_day'], message: '0–24 saat' })
    }
  })

const schema = z
  .object({
    name: z.string().trim().min(2, 'Protokol adı girin').max(200),
    species_id: z.string().uuid('Tür seçin'),
    strain_id: z.string().optional(),
    cultivation_method: z.string().optional(),
    version: z.preprocess(emptyToUndefinedNumber, z.number({ invalid_type_error: 'Sürüm girin' }).int().min(1)),
    verification_status: z.enum(['dogrulanmamis', 'kaynakli', 'uzman_dogrulamali']),
    source_reference: z.string().max(2000).optional(),
    verified_by: z.string().max(200).optional(),
    notes: z.string().max(4000).optional(),
    stages: z.array(stageSchema).min(1, 'En az bir aşama ekleyin'),
  })
  .superRefine((v, ctx) => {
    if (v.verification_status === 'kaynakli' && !v.source_reference?.trim()) {
      ctx.addIssue({ code: 'custom', path: ['source_reference'], message: 'Kaynaklı protokol için kaynak bilgisini girin' })
    }
    if (v.verification_status === 'uzman_dogrulamali' && !v.verified_by?.trim()) {
      ctx.addIssue({ code: 'custom', path: ['verified_by'], message: 'Doğrulayan uzmanı girin' })
    }
  })
type FormValues = z.infer<typeof schema>

interface Loaded {
  protocol: Protocol | null
  stages: ProtocolStage[]
  species: Species[]
  strains: Strain[]
  usageCount: number
}

export default function ProtocolEditor() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const copyFrom = params.get('kopya')
  const presetSpecies = params.get('tur')
  const orgId = useOrgId()
  const { canWrite } = useOrg()

  const sourceId = id ?? copyFrom
  const { data, error, loading, reload } = useAsync(async (): Promise<Loaded> => {
    const c = db()
    const [species, strains] = await Promise.all([
      c.from('species').select('*').or(`organization_id.is.null,organization_id.eq.${orgId}`).order('scientific_name'),
      c.from('strains').select('*').eq('organization_id', orgId).order('code'),
    ])
    let protocol: Protocol | null = null
    let stages: ProtocolStage[] = []
    let usageCount = 0
    if (sourceId) {
      const [p, s] = await Promise.all([
        c.from('protocols').select('*').eq('id', sourceId).single(),
        c.from('protocol_stages').select('*').eq('protocol_id', sourceId).order('stage_order'),
      ])
      protocol = unwrap(p) as Protocol
      stages = unwrap(s) as ProtocolStage[]
      if (id) {
        const u = await c.from('batches').select('id', { count: 'exact', head: true }).eq('protocol_id', id)
        usageCount = u.count ?? 0
      }
    }
    return { protocol, stages, species: unwrap(species) as Species[], strains: unwrap(strains) as Strain[], usageCount }
  }, [sourceId, id, orgId])

  if (loading && !data) return <Spinner />
  if (error || !data) return <ErrorBox message={error ?? 'Protokol yüklenemedi'} onRetry={() => void reload()} />

  const readOnly = !!id && (!data.protocol?.organization_id || !canWrite)
  if (!id && !canWrite) return <Notice tone="warn">Protokol oluşturma yetkiniz yok.</Notice>

  return (
    <Editor
      key={`${id ?? 'yeni'}-${copyFrom ?? ''}`}
      data={data}
      mode={readOnly ? 'view' : id ? 'edit' : 'new'}
      isCopy={!!copyFrom}
      presetSpecies={presetSpecies}
      orgId={orgId}
    />
  )
}

function Editor({
  data,
  mode,
  isCopy,
  presetSpecies,
  orgId,
}: {
  data: Loaded
  mode: 'view' | 'edit' | 'new'
  isCopy: boolean
  presetSpecies: string | null
  orgId: string
}) {
  const navigate = useNavigate()
  const toast = useToast()
  const { canWrite, canManage } = useOrg()
  const [error, setError] = useState<string | null>(null)
  const [asNewVersion, setAsNewVersion] = useState(false)
  const p = data.protocol
  const ro = mode === 'view'

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: p ? (isCopy ? `${p.name} (kopya)` : p.name) : '',
      species_id: p?.species_id ?? presetSpecies ?? '',
      strain_id: isCopy ? '' : (p?.strain_id ?? ''),
      cultivation_method: p?.cultivation_method ?? '',
      version: isCopy ? 1 : (p?.version ?? 1),
      verification_status: isCopy ? 'dogrulanmamis' : (p?.verification_status ?? 'dogrulanmamis'),
      source_reference: isCopy ? '' : (p?.source_reference ?? ''),
      verified_by: isCopy ? '' : (p?.verified_by ?? ''),
      notes: isCopy ? '' : (p?.notes ?? ''),
      stages: data.stages.length
        ? data.stages.map((s) => ({
            name: s.name,
            category: s.category,
            duration_days_min: s.duration_days_min ?? undefined,
            duration_days_max: s.duration_days_max ?? undefined,
            air_temp_min: s.air_temp_min ?? undefined,
            air_temp_max: s.air_temp_max ?? undefined,
            substrate_temp_min: s.substrate_temp_min ?? undefined,
            substrate_temp_max: s.substrate_temp_max ?? undefined,
            rh_min: s.rh_min ?? undefined,
            rh_max: s.rh_max ?? undefined,
            co2_min: s.co2_min ?? undefined,
            co2_max: s.co2_max ?? undefined,
            light_lux_min: s.light_lux_min ?? undefined,
            light_lux_max: s.light_lux_max ?? undefined,
            light_hours_per_day: s.light_hours_per_day ?? undefined,
            notes: s.notes ?? '',
          }))
        : [{ name: '', category: 'diger', notes: '' }],
    },
  })
  const stages = useFieldArray({ control, name: 'stages' })
  const speciesId = watch('species_id')
  const species = data.species.find((s) => s.id === speciesId)

  const onSubmit = handleSubmit(async (v) => {
    setError(null)
    const newRecord = mode === 'new' || asNewVersion
    const p_protocol = {
      id: newRecord ? null : p?.id,
      organization_id: orgId,
      species_id: v.species_id,
      strain_id: v.strain_id || null,
      cultivation_method: v.cultivation_method || null,
      name: v.name,
      version: asNewVersion && p ? p.version + 1 : v.version,
      verification_status: v.verification_status,
      source_reference: v.source_reference || null,
      verified_by: v.verified_by || null,
      notes: v.notes || null,
      based_on_protocol_id: isCopy || asNewVersion ? p?.id : (p?.based_on_protocol_id ?? null),
    }
    const p_stages = v.stages.map((s) => ({ ...s, notes: s.notes || null }))
    const { data: newId, error: err } = await db().rpc('save_protocol', { p_protocol, p_stages })
    if (err) {
      setError(friendlyError(err))
      return
    }
    toast.success(asNewVersion ? `Sürüm ${p_protocol.version} oluşturuldu.` : 'Protokol kaydedildi.')
    navigate(`/protokoller/${newId as string}`, { replace: true })
  })

  async function archive(flag: boolean) {
    if (!p) return
    const { error: err } = await db().from('protocols').update({ is_archived: flag }).eq('id', p.id)
    if (err) return toast.error(friendlyError(err))
    toast.success(flag ? 'Protokol arşivlendi; yeni partilerde listelenmez.' : 'Protokol arşivden çıkarıldı.')
    navigate(0)
  }

  const title = mode === 'new' ? (isCopy ? 'Protokolü kopyala' : 'Yeni protokol') : (p?.name ?? 'Protokol')

  return (
    <>
      <PageHeader
        back={
          <Link to="/protokoller" className="mb-1 inline-flex items-center gap-1 text-sm text-muted">
            <ArrowLeft className="size-4" /> Protokoller
          </Link>
        }
        title={title}
        subtitle={
          p && mode !== 'new' ? (
            <span className="flex flex-wrap items-center gap-2">
              Sürüm {p.version}
              <Badge tone={p.verification_status === 'dogrulanmamis' ? 'warn' : 'green'}>{label('verification', p.verification_status)}</Badge>
              {!p.organization_id && <Badge>Sistem şablonu</Badge>}
              {p.is_archived && <Badge>Arşivde</Badge>}
            </span>
          ) : undefined
        }
        actions={
          p &&
          mode !== 'new' &&
          canWrite && (
            <>
              <LinkButton to={`/protokoller/yeni?kopya=${p.id}`} variant="secondary" icon={<Copy className="size-4" />}>
                {p.organization_id ? 'Kopyala' : 'Kopyala ve düzenle'}
              </LinkButton>
              {p.organization_id && canManage && (
                <Button variant="ghost" onClick={() => void archive(!p.is_archived)}>
                  {p.is_archived ? 'Arşivden çıkar' : 'Arşivle'}
                </Button>
              )}
            </>
          )
        }
      />

      {ro && p && !p.organization_id && (
        <div className="mb-4">
          <Notice tone="info">
            Bu bir sistem şablonudur ve yalnızca aşama adlarını içerir. Sıcaklık, nem, CO₂ ve ışık hedefleri bilinçli olarak boş
            bırakılmıştır. “Kopyala ve düzenle” ile işletmenize kopyalayıp kaynaklı ve doğrulanmış değerlerinizi girin.
          </Notice>
        </div>
      )}
      {mode === 'edit' && data.usageCount > 0 && (
        <div className="mb-4">
          <Notice tone="warn">
            Bu protokol {data.usageCount} partide kullanıldı. Partiler kendi protokol kopyasını sakladığı için bu değişiklikler onları
            etkilemez. Değişikliği izlenebilir tutmak için “yeni sürüm olarak kaydet” seçeneğini kullanabilirsiniz.
          </Notice>
        </div>
      )}

      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {error && <Notice tone="danger">{error}</Notice>}
        <fieldset disabled={ro} className="space-y-4">
          <Card>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Protokol adı" required error={errors.name?.message} className="sm:col-span-2">
                <Input {...register('name')} />
              </Field>
              <Field label="Mantar türü" required error={errors.species_id?.message}>
                <Select {...register('species_id')}>
                  <option value="">Seçin…</option>
                  {data.species.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.scientific_name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Suş / izolat (isteğe bağlı)" hint="Boşsa türün bütün suşları için geçerlidir.">
                <Select {...register('strain_id')}>
                  <option value="">Bütün suşlar</option>
                  {data.strains
                    .filter((s) => s.species_id === speciesId)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field label="Üretim yöntemi (isteğe bağlı)">
                <Select {...register('cultivation_method')}>
                  <option value="">Bütün yöntemler</option>
                  {options('methods').map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Sürüm" error={errors.version?.message}>
                <Input inputMode="numeric" {...register('version')} readOnly={mode === 'edit'} />
              </Field>
              <Field label="Doğrulama durumu">
                <Select {...register('verification_status')}>
                  {options('verification').map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Doğrulayan uzman" error={errors.verified_by?.message}>
                <Input {...register('verified_by')} />
              </Field>
              <Field label="Kaynak bilgisi" error={errors.source_reference?.message} className="sm:col-span-2" hint="Makale, kitap, kurum protokolü, kendi deneme kayıtları…">
                <Textarea {...register('source_reference')} rows={2} />
              </Field>
              <Field label="Notlar" className="sm:col-span-2">
                <Textarea {...register('notes')} rows={2} />
              </Field>
              {species?.is_species_group && (
                <p className="text-xs text-warn sm:col-span-2">Seçilen tür bir tür grubudur; mümkünse protokolü belirli bir suşa bağlayın.</p>
              )}
            </div>
          </Card>

          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Aşamalar</h2>
              {!ro && (
                <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => stages.append({ name: '', category: 'diger', notes: '' })}>
                  Aşama ekle
                </Button>
              )}
            </div>
            {errors.stages?.root?.message && <p className="mb-2 text-sm text-danger">{errors.stages.root.message}</p>}
            {errors.stages?.message && <p className="mb-2 text-sm text-danger">{errors.stages.message}</p>}
            <p className="mb-3 text-xs text-muted">Boş bırakılan hedef alanlar “tanımlanmamış” kabul edilir. Değer girdiğinizde kaynağını yukarıda belirtin.</p>
            <div className="space-y-3">
              {stages.fields.map((f, i) => {
                const e = errors.stages?.[i]
                return (
                  <details key={f.id} className="group rounded-xl border border-line" open={!ro || data.stages.length <= 3}>
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5">
                      <span className="text-sm font-medium">
                        {i + 1}. {watch(`stages.${i}.name`) || 'Yeni aşama'}
                        <span className="ml-2 text-xs font-normal text-muted">{label('stageCategories', watch(`stages.${i}.category`))}</span>
                      </span>
                      {!ro && (
                        <span className="flex gap-1">
                          <Button size="sm" variant="ghost" aria-label="Yukarı taşı" disabled={i === 0} onClick={() => stages.move(i, i - 1)}>
                            <ArrowUp className="size-4" />
                          </Button>
                          <Button size="sm" variant="ghost" aria-label="Aşağı taşı" disabled={i === stages.fields.length - 1} onClick={() => stages.move(i, i + 1)}>
                            <ArrowDown className="size-4" />
                          </Button>
                          <Button size="sm" variant="ghost" aria-label="Aşamayı sil" onClick={() => stages.remove(i)}>
                            <Trash2 className="size-4" />
                          </Button>
                        </span>
                      )}
                    </summary>
                    <div className="grid gap-3 border-t border-line p-3 sm:grid-cols-2">
                      <Field label="Aşama adı" required error={e?.name?.message}>
                        <Input {...register(`stages.${i}.name`)} />
                      </Field>
                      <Field label="Kategori" hint="Panodaki sayımlar (inkübasyon, hasada yaklaşan) için kullanılır.">
                        <Select {...register(`stages.${i}.category`)}>
                          {options('stageCategories').map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      {RANGES.map(([a, b, l]) => (
                        <div key={a} className="grid grid-cols-2 gap-2">
                          <Field label={`${l} en az`} error={e?.[a]?.message}>
                            <Input inputMode="decimal" {...register(`stages.${i}.${a}`)} placeholder="—" />
                          </Field>
                          <Field label="en çok" error={e?.[b]?.message}>
                            <Input inputMode="decimal" {...register(`stages.${i}.${b}`)} placeholder="—" />
                          </Field>
                        </div>
                      ))}
                      <Field label="Günlük ışık süresi (saat)" error={e?.light_hours_per_day?.message}>
                        <Input inputMode="decimal" {...register(`stages.${i}.light_hours_per_day`)} placeholder="—" />
                      </Field>
                      <Field label="Notlar" className="sm:col-span-2">
                        <Textarea rows={2} {...register(`stages.${i}.notes`)} />
                      </Field>
                    </div>
                  </details>
                )
              })}
            </div>
          </Card>
        </fieldset>

        {!ro && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {mode === 'edit' && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-[var(--color-primary)]" checked={asNewVersion} onChange={(e) => setAsNewVersion(e.target.checked)} />
                Yeni sürüm olarak kaydet (s{(p?.version ?? 0) + 1}); mevcut sürüm değişmeden kalır
              </label>
            )}
            <Button type="submit" loading={isSubmitting} className="sm:ml-auto">
              Kaydet
            </Button>
          </div>
        )}
      </form>
    </>
  )
}
