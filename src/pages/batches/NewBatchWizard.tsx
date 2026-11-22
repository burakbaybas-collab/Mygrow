import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useFieldArray, useForm, type FieldErrors } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, Check, Plus, Trash2 } from 'lucide-react'
import { db } from '../../lib/supabase'
import { unwrap, useAsync } from '../../lib/useAsync'
import { friendlyError } from '../../lib/errors'
import { useOrg, useOrgId } from '../../context/OrgContext'
import { displayNameOf, useAuth } from '../../context/AuthContext'
import { initialSubstrate, spawnRate, toNumber, type MaterialInput } from '../../lib/calc'
import { fmtDate, fmtKg, fmtNumber, fmtPercent, todayIso } from '../../lib/format'
import { label, options } from '../../i18n'
import type { Facility, Protocol, ProtocolStage, RecipeComponent, Room, Species, Strain, SubstrateRecipe } from '../../lib/types'
import {
  Button,
  Card,
  DefinitionList,
  ErrorBox,
  Field,
  Input,
  LinkButton,
  Notice,
  PageHeader,
  SciName,
  Select,
  Spinner,
  Textarea,
  cx,
} from '../../components/ui'
import { useToast } from '../../components/Toast'
import { METHOD_UNIT, STEP_FIELDS, batchSchema, suggestBatchCode, type BatchFormValues } from './batchSchema'

const STEPS = ['Parti bilgileri', 'Substrat', 'Üretim birimleri', 'Kontrol ve kayıt']

interface Catalog {
  species: Species[]
  strains: Strain[]
  facilities: Facility[]
  rooms: Room[]
  protocols: Protocol[]
  recipes: SubstrateRecipe[]
}

async function loadCatalog(orgId: string): Promise<Catalog> {
  const c = db()
  const [species, strains, facilities, rooms, protocols, recipes] = await Promise.all([
    c.from('species').select('*').or(`organization_id.is.null,organization_id.eq.${orgId}`).order('scientific_name'),
    c.from('strains').select('*').eq('organization_id', orgId).eq('is_active', true).order('code'),
    c.from('facilities').select('*').eq('organization_id', orgId).order('name'),
    c.from('rooms').select('*').eq('organization_id', orgId).eq('is_active', true).order('name'),
    c.from('protocols').select('*').or(`organization_id.is.null,organization_id.eq.${orgId}`).eq('is_archived', false).order('name'),
    c.from('substrate_recipes').select('*').eq('organization_id', orgId).eq('is_archived', false).order('name'),
  ])
  return {
    species: unwrap(species) as Species[],
    strains: unwrap(strains) as Strain[],
    facilities: unwrap(facilities) as Facility[],
    rooms: unwrap(rooms) as Room[],
    protocols: unwrap(protocols) as Protocol[],
    recipes: unwrap(recipes) as SubstrateRecipe[],
  }
}

export default function NewBatchWizard() {
  const orgId = useOrgId()
  const { canWrite } = useOrg()
  const { data: catalog, error, loading, reload } = useAsync(() => loadCatalog(orgId), [orgId])

  if (!canWrite) {
    return <Notice tone="warn">Salt okunur yetkiyle parti oluşturamazsınız. İşletme sahibinden yetki isteyin.</Notice>
  }
  if (loading) return <Spinner />
  if (error || !catalog) return <ErrorBox message={error ?? 'Katalog yüklenemedi'} onRetry={() => void reload()} />
  if (catalog.facilities.length === 0) {
    return (
      <>
        <PageHeader title="Yeni üretim partisi" />
        <Notice tone="warn" title="Önce bir tesis tanımlayın">
          Her parti bir tesise bağlıdır. “Tesis ve Odalar” bölümünden tesis ve üretim odası ekleyin.
          <div className="mt-3">
            <LinkButton to="/tesisler">Tesis ve odalara git</LinkButton>
          </div>
        </Notice>
      </>
    )
  }
  return <Wizard catalog={catalog} orgId={orgId} />
}

function Wizard({ catalog, orgId }: { catalog: Catalog; orgId: string }) {
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useAuth()
  const { current } = useOrg()
  const [step, setStep] = useState(0)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [stages, setStages] = useState<ProtocolStage[]>([])
  const [recipeComponents, setRecipeComponents] = useState<RecipeComponent[]>([])
  const [mixTotal, setMixTotal] = useState('')

  const form = useForm<BatchFormValues>({
    resolver: zodResolver(batchSchema),
    mode: 'onTouched',
    defaultValues: {
      batch_code: '',
      species_id: '',
      strain_id: '',
      cultivation_method: undefined,
      facility_id: catalog.facilities.length === 1 ? catalog.facilities[0].id : '',
      room_id: '',
      responsible_name: current?.display_name || displayNameOf(user),
      start_date: todayIso(),
      inoculation_date: '',
      protocol_id: '',
      initial_stage_id: '',
      is_demo: false,
      notes: '',
      recipe_id: '',
      recipe_name: '',
      materials: [],
      treatment_method: '',
      treatment_date: '',
      substrate_notes: '',
      unit_type: '',
      spawn_rate_basis: 'yas',
    },
  })
  const { register, watch, setValue, getValues, trigger, handleSubmit, control, formState } = form
  const { errors, isSubmitting } = formState
  const materials = useFieldArray({ control, name: 'materials' })

  const speciesId = watch('species_id')
  const method = watch('cultivation_method')
  const strainId = watch('strain_id')
  const facilityId = watch('facility_id')
  const protocolId = watch('protocol_id')
  const recipeId = watch('recipe_id')

  const species = catalog.species.find((s) => s.id === speciesId)
  const strainsForSpecies = catalog.strains.filter((s) => s.species_id === speciesId)
  const roomsForFacility = catalog.rooms.filter((r) => r.facility_id === facilityId)
  const protocolsForBatch = catalog.protocols.filter(
    (p) =>
      p.species_id === speciesId &&
      (!p.cultivation_method || p.cultivation_method === method) &&
      (!p.strain_id || p.strain_id === strainId),
  )

  // Tür değişince yöntem ve parti kodu önerisi
  useEffect(() => {
    if (!species) return
    const cur = getValues('cultivation_method')
    if (!cur && species.cultivation_methods.length > 0) {
      setValue('cultivation_method', species.cultivation_methods[0], { shouldValidate: true })
    }
    if (!getValues('batch_code')) setValue('batch_code', suggestBatchCode(species.scientific_name, getValues('start_date')))
    if (getValues('strain_id') && !catalog.strains.some((s) => s.id === getValues('strain_id') && s.species_id === species.id)) {
      setValue('strain_id', '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speciesId])

  // Yöntem değişince birim tipi
  useEffect(() => {
    if (method) setValue('unit_type', METHOD_UNIT[method] ?? '')
  }, [method, setValue])

  // Seçili protokol listede değilse temizle; varsa aşamaları yükle
  useEffect(() => {
    if (protocolId && !protocolsForBatch.some((p) => p.id === protocolId)) setValue('protocol_id', '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speciesId, method, strainId])

  useEffect(() => {
    let cancelled = false
    setStages([])
    setValue('initial_stage_id', '')
    if (!protocolId) return
    void db()
      .from('protocol_stages')
      .select('*')
      .eq('protocol_id', protocolId)
      .order('stage_order')
      .then(({ data }) => {
        if (cancelled || !data) return
        setStages(data as ProtocolStage[])
        if (data.length) setValue('initial_stage_id', (data[0] as ProtocolStage).id)
      })
    return () => {
      cancelled = true
    }
  }, [protocolId, setValue])

  useEffect(() => {
    let cancelled = false
    setRecipeComponents([])
    if (!recipeId) return
    const r = catalog.recipes.find((x) => x.id === recipeId)
    if (r) {
      setValue('recipe_name', `${r.name} (s${r.version})`)
      if (r.default_treatment && !getValues('treatment_method')) setValue('treatment_method', r.default_treatment)
    }
    void db()
      .from('recipe_components')
      .select('*')
      .eq('recipe_id', recipeId)
      .order('sort_order')
      .then(({ data }) => {
        if (!cancelled && data) setRecipeComponents(data as RecipeComponent[])
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeId])

  function applyRecipe() {
    const total = toNumber(mixTotal)
    materials.replace(
      recipeComponents.map((c) => ({
        component_name: c.component_name,
        role: c.role,
        wet_weight_kg:
          total !== undefined && Number.isFinite(total) && c.proportion_percent !== null
            ? Math.round(total * c.proportion_percent * 10) / 1000
            : (undefined as unknown as number),
        moisture_percent: c.default_moisture_percent ?? undefined,
        added_on: '',
        notes: '',
      })),
    )
  }

  // Canlı hesaplama (formdaki ham değerlerden)
  const watchedMaterials = watch('materials')
  const unitCount = toNumber(watch('unit_count'))
  const perUnit = toNumber(watch('wet_substrate_per_unit_kg'))
  const spawnKg = toNumber(watch('spawn_weight_kg'))
  const basis = watch('spawn_rate_basis')
  const calc = useMemo(() => {
    const mats: MaterialInput[] = (watchedMaterials ?? []).map((m) => ({
      name: m.component_name,
      role: m.role,
      wetKg: toNumber(m.wet_weight_kg),
      moisturePercent: toNumber(m.moisture_percent),
    }))
    const sub = initialSubstrate({
      materials: mats,
      unitCount: unitCount !== undefined && perUnit !== undefined ? unitCount : undefined,
      perUnitKg: unitCount !== undefined && perUnit !== undefined ? perUnit : undefined,
    })
    const fillWet = unitCount !== undefined && perUnit !== undefined ? unitCount * perUnit : undefined
    const wet = sub.ok ? sub.value.totalWetKg : fillWet
    const dry = sub.ok ? sub.value.totalDryKg : undefined
    const spawn = spawnKg === undefined ? null : spawnRate(spawnKg, basis, basis === 'yas' ? wet : dry)
    return { sub, wet, dry, spawn }
  }, [watchedMaterials, unitCount, perUnit, spawnKg, basis])

  async function next() {
    const valid = await trigger(STEP_FIELDS[step], { shouldFocus: true })
    if (valid) {
      const nextStep = Math.min(step + 1, STEPS.length - 1)
      setStep(nextStep)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      // Son adımda bütün formu doğrulayıp eksikleri özet listesinde göster
      if (nextStep === STEPS.length - 1) void trigger()
    }
  }

  const onSubmit = handleSubmit(
    async (v) => {
      setSubmitError(null)
      const stage = stages.find((s) => s.id === v.initial_stage_id)
      const p_batch = {
        organization_id: orgId,
        batch_code: v.batch_code,
        species_id: v.species_id,
        strain_id: v.strain_id || null,
        protocol_id: v.protocol_id || null,
        recipe_id: v.recipe_id || null,
        recipe_name: v.recipe_name || null,
        cultivation_method: v.cultivation_method,
        facility_id: v.facility_id,
        room_id: v.room_id || null,
        responsible_name: v.responsible_name || null,
        start_date: v.start_date,
        inoculation_date: v.inoculation_date || null,
        unit_type: v.unit_type || null,
        unit_count: v.unit_count ?? null,
        wet_substrate_per_unit_kg: v.wet_substrate_per_unit_kg ?? null,
        spawn_weight_kg: v.spawn_weight_kg ?? null,
        spawn_rate_basis: v.spawn_weight_kg !== undefined ? v.spawn_rate_basis : null,
        substrate_ph: v.substrate_ph ?? null,
        treatment_method: v.treatment_method || null,
        treatment_date: v.treatment_date || null,
        substrate_notes: v.substrate_notes || null,
        notes: v.notes || null,
        is_demo: v.is_demo,
        initial_stage_name: stage?.name ?? null,
        initial_stage_category: stage?.category ?? null,
        initial_stage_order: stage?.stage_order ?? null,
        initial_protocol_stage_id: stage?.id ?? null,
      }
      const p_materials = v.materials.map((m) => ({
        component_name: m.component_name,
        role: m.role,
        wet_weight_kg: m.wet_weight_kg,
        moisture_percent: m.moisture_percent ?? null,
        added_on: m.added_on || null,
        notes: m.notes || null,
      }))
      const { data, error } = await db().rpc('create_batch', { p_batch, p_materials })
      if (error) {
        setSubmitError(friendlyError(error, { unique: 'Bu parti kodu bu işletmede zaten kullanılıyor. Farklı bir kod girin.' }))
        return
      }
      toast.success(`${v.batch_code} kodlu parti kaydedildi.`)
      navigate(`/partiler/${data as string}`, { replace: true })
    },
    (errs) => {
      setSubmitError('Formda eksik veya hatalı alanlar var. Aşağıdaki listeyi kontrol edin.')
      const firstStep = STEP_FIELDS.findIndex((fields) => fields.some((f) => f in errs))
      if (firstStep >= 0 && firstStep < step) setStep(firstStep)
    },
  )

  const v = watch()
  const errorList = collectErrors(errors)

  return (
    <>
      <PageHeader
        title="Yeni üretim partisi"
        back={
          <Link to="/partiler" className="mb-1 inline-flex items-center gap-1 text-sm text-muted">
            <ArrowLeft className="size-4" /> Partiler
          </Link>
        }
      />

      <ol className="mb-5 grid grid-cols-4 gap-1.5" aria-label="Adımlar">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              disabled={i > step}
              onClick={() => i < step && setStep(i)}
              className={cx(
                'w-full rounded-lg border-t-4 pt-2 text-left text-xs font-medium',
                i < step && 'border-secondary text-secondary',
                i === step && 'border-primary text-primary',
                i > step && 'border-line text-muted',
              )}
              aria-current={i === step ? 'step' : undefined}
            >
              <span className="hidden sm:inline">{i + 1}. </span>
              {s}
            </button>
          </li>
        ))}
      </ol>

      <form
        onSubmit={onSubmit}
        noValidate
        className="grid gap-5 lg:grid-cols-[1fr_300px]"
        onKeyDown={(e) => {
          // Ara adımlarda Enter tuşu formu göndermesin, sonraki adıma geçsin
          if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT' && step < STEPS.length - 1) {
            e.preventDefault()
            void next()
          }
        }}
      >
        <div className="space-y-5">
          {step === 0 && (
            <Card>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Mantar türü" required error={errors.species_id?.message} className="sm:col-span-2">
                  <Select {...register('species_id')} aria-invalid={!!errors.species_id}>
                    <option value="">Seçin…</option>
                    {catalog.species.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.scientific_name}
                        {s.turkish_name ? ` — ${s.turkish_name}` : ''}
                        {s.organization_id ? ' (işletmeye özel)' : ''}
                      </option>
                    ))}
                  </Select>
                </Field>
                {species?.is_species_group && (
                  <div className="sm:col-span-2">
                    <Notice tone="warn">
                      <SciName name={species.scientific_name} /> bir tür grubudur. Kesin tür kimliği suş/izolat kaydında belirtilir;
                      doğrulanmamışsa doğrulanmış tür adı varmış gibi raporlanmaz.
                    </Notice>
                  </div>
                )}
                <Field label="Parti kodu (benzersiz)" required error={errors.batch_code?.message}>
                  <Input {...register('batch_code')} aria-invalid={!!errors.batch_code} />
                </Field>
                <Field
                  label="İzolat veya suş"
                  hint={
                    speciesId && strainsForSpecies.length === 0 ? (
                      <>
                        Bu tür için kayıtlı suş yok.{' '}
                        <Link className="underline" to={`/turler/${speciesId}`}>
                          Suş ekle
                        </Link>
                      </>
                    ) : undefined
                  }
                >
                  <Select {...register('strain_id')} disabled={!speciesId}>
                    <option value="">Belirtilmedi</option>
                    {strainsForSpecies.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code}
                        {s.name ? ` — ${s.name}` : ''}
                        {s.identity_status !== 'dogrulanmis' ? ' (kimlik doğrulanmamış)' : ''}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Üretim yöntemi" required error={errors.cultivation_method?.message}>
                  <Select {...register('cultivation_method')} aria-invalid={!!errors.cultivation_method}>
                    <option value="">Seçin…</option>
                    {options('methods').map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                        {species && !species.cultivation_methods.includes(o.value as never) ? ' (katalogda listelenmemiş)' : ''}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Sorumlu kişi">
                  <Input {...register('responsible_name')} />
                </Field>
                <Field label="Tesis" required error={errors.facility_id?.message}>
                  <Select {...register('facility_id')} aria-invalid={!!errors.facility_id}>
                    <option value="">Seçin…</option>
                    {catalog.facilities.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  label="Üretim odası"
                  hint={facilityId && roomsForFacility.length === 0 ? 'Bu tesiste tanımlı oda yok.' : undefined}
                >
                  <Select {...register('room_id')} disabled={!facilityId}>
                    <option value="">Belirtilmedi</option>
                    {roomsForFacility.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({label('roomTypes', r.room_type)})
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Başlangıç tarihi" required error={errors.start_date?.message}>
                  <Input type="date" {...register('start_date')} aria-invalid={!!errors.start_date} />
                </Field>
                <Field label="İnokülasyon tarihi" error={errors.inoculation_date?.message} hint="BE ve ilk hasat süresi hesapları için gerekir.">
                  <Input type="date" {...register('inoculation_date')} aria-invalid={!!errors.inoculation_date} />
                </Field>
                <Field
                  label="Üretim protokolü"
                  className="sm:col-span-2"
                  hint={speciesId && protocolsForBatch.length === 0 ? 'Bu tür/yöntem için protokol yok; aşamaları parti detayında elle girebilirsiniz.' : undefined}
                >
                  <Select {...register('protocol_id')} disabled={!speciesId}>
                    <option value="">Protokol kullanılmayacak</option>
                    {protocolsForBatch.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — s{p.version} · {label('verification', p.verification_status)}
                        {p.organization_id ? '' : ' (sistem şablonu)'}
                      </option>
                    ))}
                  </Select>
                </Field>
                {stages.length > 0 && (
                  <Field label="Başlangıç aşaması" className="sm:col-span-2">
                    <Select {...register('initial_stage_id')}>
                      {stages.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.stage_order}. {s.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
                <Field label="Açıklamalar" className="sm:col-span-2">
                  <Textarea {...register('notes')} />
                </Field>
                <label className="flex items-start gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" className="mt-0.5 size-4 accent-[var(--color-primary)]" {...register('is_demo')} />
                  <span>
                    Bu parti <b>örnek/deneme verisidir</b> (gerçek üretim sonuçlarıyla karıştırılmaz ve her yerde “Örnek veri” olarak
                    etiketlenir).
                  </span>
                </label>
              </div>
            </Card>
          )}

          {step === 1 && (
            <>
              <Card>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Substrat reçetesi"
                    hint={
                      catalog.recipes.length === 0 ? (
                        <>
                          Kayıtlı reçete yok.{' '}
                          <Link to="/receteler/yeni" className="underline">
                            Reçete oluştur
                          </Link>
                        </>
                      ) : undefined
                    }
                  >
                    <Select {...register('recipe_id')}>
                      <option value="">Reçetesiz (bileşenleri elle girin)</option>
                      {catalog.recipes.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} — sürüm {r.version}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Reçete adı / sürüm notu">
                    <Input {...register('recipe_name')} placeholder="ör. Saman-kepek v2" />
                  </Field>
                  {recipeComponents.length > 0 && (
                    <div className="flex flex-col gap-2 rounded-xl bg-canvas p-3 sm:col-span-2 sm:flex-row sm:items-end">
                      <Field label="Hazırlanan toplam karışım (kg, isteğe bağlı)" hint="Girilirse yaş ağırlıklar reçete oranlarından doldurulur." className="flex-1">
                        <Input inputMode="decimal" value={mixTotal} onChange={(e) => setMixTotal(e.target.value)} />
                      </Field>
                      <Button variant="secondary" onClick={applyRecipe}>
                        Reçete bileşenlerini getir
                      </Button>
                    </div>
                  )}
                </div>
              </Card>

              <Card>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-semibold">Bileşenler</h2>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Plus className="size-4" />}
                    onClick={() =>
                      materials.append({
                        component_name: '',
                        role: 'substrat',
                        wet_weight_kg: undefined as unknown as number,
                        moisture_percent: undefined,
                        added_on: '',
                        notes: '',
                      })
                    }
                  >
                    Bileşen ekle
                  </Button>
                </div>
                <p className="mb-3 text-xs text-muted">
                  Her bileşen ayrı satırda kaydedilir. Kuru madde = yaş ağırlık × (1 − nem/100). Su için nem %100 girin.
                  Örtü toprağı ve sonradan eklenen maddeler başlangıç kuru substratına (BE paydası) dahil edilmez.
                </p>
                {materials.fields.length === 0 && (
                  <Notice tone="info">Henüz bileşen yok. Bileşen girilmezse kuru substrat ve BE hesaplanamaz.</Notice>
                )}
                <div className="space-y-3">
                  {materials.fields.map((f, i) => {
                    const e = errors.materials?.[i]
                    const wet = toNumber(watchedMaterials?.[i]?.wet_weight_kg)
                    const moist = toNumber(watchedMaterials?.[i]?.moisture_percent)
                    const dry = wet !== undefined && moist !== undefined && moist >= 0 && moist <= 100 ? wet * (1 - moist / 100) : undefined
                    return (
                      <div key={f.id} className="rounded-xl border border-line p-3">
                        <div className="grid gap-3 sm:grid-cols-12">
                          <Field label="Bileşen" required error={e?.component_name?.message} className="sm:col-span-4">
                            <Input {...register(`materials.${i}.component_name`)} placeholder="ör. Kayın talaşı" />
                          </Field>
                          <Field label="Rol" className="sm:col-span-3">
                            <Select {...register(`materials.${i}.role`)}>
                              {options('materialRoles').map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </Select>
                          </Field>
                          <Field label="Yaş ağırlık (kg)" required error={e?.wet_weight_kg?.message} className="sm:col-span-2">
                            <Input inputMode="decimal" {...register(`materials.${i}.wet_weight_kg`)} />
                          </Field>
                          <Field label="Nem (%)" error={e?.moisture_percent?.message} className="sm:col-span-2">
                            <Input inputMode="decimal" {...register(`materials.${i}.moisture_percent`)} />
                          </Field>
                          <div className="flex items-end sm:col-span-1">
                            <Button variant="ghost" size="sm" aria-label="Bileşeni sil" onClick={() => materials.remove(i)}>
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </div>
                        <p className="mt-2 text-xs text-muted">
                          Kuru madde: <b>{dry === undefined ? 'nem girilmedi' : fmtKg(dry, 3)}</b>
                        </p>
                      </div>
                    )
                  })}
                </div>
              </Card>

              <Card>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Pastörizasyon / sterilizasyon yöntemi">
                    <Select {...register('treatment_method')}>
                      <option value="">Belirtilmedi</option>
                      {options('treatments').map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Uygulama tarihi">
                    <Input type="date" {...register('treatment_date')} />
                  </Field>
                  <Field label="Substrat pH (isteğe bağlı)" error={errors.substrate_ph?.message}>
                    <Input inputMode="decimal" {...register('substrate_ph')} />
                  </Field>
                  <Field label="Substrat açıklamaları" className="sm:col-span-2">
                    <Textarea {...register('substrate_notes')} />
                  </Field>
                </div>
              </Card>
            </>
          )}

          {step === 2 && (
            <Card>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Üretim birimi tipi">
                  <Input {...register('unit_type')} placeholder="Torba, şişe, kasa…" />
                </Field>
                <Field label="Birim sayısı (torba/şişe/kasa)" error={errors.unit_count?.message}>
                  <Input inputMode="numeric" {...register('unit_count')} />
                </Field>
                <Field label="Birim başına yaş substrat (kg)" error={errors.wet_substrate_per_unit_kg?.message}>
                  <Input inputMode="decimal" {...register('wet_substrate_per_unit_kg')} />
                </Field>
                <Field label="Toplam yaş substrat (hesaplanan)">
                  <Input readOnly value={calc.wet === undefined ? '—' : fmtKg(calc.wet, 3)} />
                </Field>
                <Field label="Kullanılan misel (kg)" error={errors.spawn_weight_kg?.message}>
                  <Input inputMode="decimal" {...register('spawn_weight_kg')} />
                </Field>
                <Field label="Misel oranı paydası">
                  <Select {...register('spawn_rate_basis')}>
                    {options('spawnBasis').map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="sm:col-span-2">
                  <Notice tone="info">
                    Misel oranı ={' '}
                    {calc.spawn === null
                      ? 'misel girilmedi'
                      : calc.spawn.ok
                        ? `${fmtPercent(calc.spawn.value, 2)} (${basis === 'yas' ? 'yaş' : 'kuru'} substrata göre)`
                        : calc.spawn.reason}
                  </Notice>
                </div>
                <p className="text-xs text-muted sm:col-span-2">
                  Protokol ve sürümü 1. adımda seçilir; parti kaydedildiğinde protokolün o anki hali partiyle birlikte saklanır ve
                  sonradan protokol değişse bile bu parti etkilenmez.
                </p>
              </div>
            </Card>
          )}

          {step === 3 && (
            <>
              {errorList.length > 0 && (
                <Notice tone="danger" title="Düzeltilmesi gereken alanlar">
                  <ul className="list-disc pl-4">
                    {errorList.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </Notice>
              )}
              <Card>
                <h2 className="mb-3 font-semibold">Parti bilgileri</h2>
                <DefinitionList
                  items={[
                    { label: 'Parti kodu', value: v.batch_code },
                    { label: 'Tür', value: species ? <SciName name={species.scientific_name} /> : '—' },
                    { label: 'Suş / izolat', value: catalog.strains.find((s) => s.id === v.strain_id)?.code ?? 'Belirtilmedi' },
                    { label: 'Yöntem', value: label('methods', v.cultivation_method) },
                    { label: 'Tesis', value: catalog.facilities.find((f) => f.id === v.facility_id)?.name },
                    { label: 'Oda', value: catalog.rooms.find((r) => r.id === v.room_id)?.name ?? 'Belirtilmedi' },
                    { label: 'Başlangıç', value: fmtDate(v.start_date) },
                    { label: 'İnokülasyon', value: v.inoculation_date ? fmtDate(v.inoculation_date) : 'Girilmedi' },
                    { label: 'Protokol', value: catalog.protocols.find((p) => p.id === v.protocol_id)?.name ?? 'Yok' },
                    { label: 'Başlangıç aşaması', value: stages.find((s) => s.id === v.initial_stage_id)?.name ?? '—' },
                    { label: 'Sorumlu', value: v.responsible_name || '—' },
                    { label: 'Veri türü', value: v.is_demo ? 'Örnek/deneme verisi' : 'Gerçek üretim' },
                  ]}
                />
              </Card>
              <Card>
                <h2 className="mb-3 font-semibold">Substrat ve birimler</h2>
                <DefinitionList
                  items={[
                    { label: 'Reçete', value: v.recipe_name || 'Reçetesiz' },
                    { label: 'Bileşen sayısı', value: String(v.materials.length) },
                    { label: 'İşlem', value: v.treatment_method ? label('treatments', v.treatment_method) : '—' },
                    { label: 'Birim', value: unitCount !== undefined ? `${fmtNumber(unitCount)} × ${fmtKg(perUnit, 3)}` : 'Girilmedi' },
                    { label: 'Misel', value: spawnKg !== undefined ? fmtKg(spawnKg, 3) : 'Girilmedi' },
                  ]}
                />
              </Card>
            </>
          )}

          {submitError && <Notice tone="danger">{submitError}</Notice>}

          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="secondary" onClick={() => setStep((s) => s - 1)}>
                Geri
              </Button>
            )}
            {step < STEPS.length - 1 ? (
              <Button className="flex-1 sm:flex-none" onClick={() => void next()}>
                Devam
              </Button>
            ) : (
              <Button type="submit" className="flex-1 sm:flex-none" loading={isSubmitting} icon={<Check className="size-4" />}>
                Partiyi kaydet
              </Button>
            )}
          </div>
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <Card>
            <h2 className="mb-3 text-sm font-semibold">Hesaplanan değerler</h2>
            <dl className="space-y-2 text-sm">
              <Row k="Toplam yaş substrat" v={calc.wet === undefined ? '—' : fmtKg(calc.wet, 3)} />
              <Row k="Başlangıç kuru substrat" v={calc.dry === undefined ? '—' : fmtKg(calc.dry, 3)} />
              <Row
                k="Misel oranı"
                v={calc.spawn === null ? '—' : calc.spawn.ok ? `${fmtPercent(calc.spawn.value, 2)} (${basis === 'yas' ? 'yaş' : 'kuru'})` : '—'}
              />
            </dl>
            {!calc.sub.ok && <p className="mt-3 text-xs text-warn">Kuru substrat: {calc.sub.reason}</p>}
            {calc.sub.ok &&
              calc.sub.warnings.map((w) => (
                <p key={w} className="mt-3 text-xs text-warn">
                  {w}
                </p>
              ))}
            {calc.sub.ok && (
              <p className="mt-3 text-xs text-muted">
                Yöntem:{' '}
                {calc.sub.value.method === 'dolum_x_karisim_kuru_orani'
                  ? 'birim dolumu × karışımın kuru madde oranı'
                  : 'bileşen kuru ağırlıklarının toplamı'}
                . Kesin değer kayıt sırasında veri tabanında aynı formülle yeniden hesaplanır.
              </p>
            )}
          </Card>
        </aside>
      </form>
    </>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  )
}

function collectErrors(errors: FieldErrors<BatchFormValues>): string[] {
  const out: string[] = []
  const walk = (node: unknown, path: string) => {
    if (!node || typeof node !== 'object') return
    const n = node as { message?: unknown }
    if (typeof n.message === 'string') {
      out.push(path ? `${path}: ${n.message}` : n.message)
      return
    }
    for (const [k, child] of Object.entries(node as Record<string, unknown>)) {
      if (k === 'ref' || k === 'type') continue
      const name = /^\d+$/.test(k) ? `${Number(k) + 1}. bileşen` : FIELD_LABELS[k] ?? k
      walk(child, path ? `${path} › ${name}` : name)
    }
  }
  walk(errors, '')
  return out
}

const FIELD_LABELS: Record<string, string> = {
  batch_code: 'Parti kodu',
  species_id: 'Mantar türü',
  cultivation_method: 'Üretim yöntemi',
  facility_id: 'Tesis',
  start_date: 'Başlangıç tarihi',
  inoculation_date: 'İnokülasyon tarihi',
  materials: 'Substrat',
  component_name: 'Bileşen adı',
  wet_weight_kg: 'Yaş ağırlık',
  moisture_percent: 'Nem',
  substrate_ph: 'pH',
  unit_count: 'Birim sayısı',
  wet_substrate_per_unit_kg: 'Birim başına substrat',
  spawn_weight_kg: 'Misel',
}
