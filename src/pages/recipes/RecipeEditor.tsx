import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { db } from '../../lib/supabase'
import { unwrap, useAsync } from '../../lib/useAsync'
import { friendlyError } from '../../lib/errors'
import { useOrg, useOrgId } from '../../context/OrgContext'
import { options } from '../../i18n'
import { fmtNumber } from '../../lib/format'
import { toNumber, isInitialSubstrate } from '../../lib/calc'
import type { RecipeComponent, Species, SubstrateRecipe } from '../../lib/types'
import { Button, Card, ErrorBox, Field, Input, Notice, PageHeader, Select, Spinner, Textarea } from '../../components/ui'
import { useToast } from '../../components/Toast'
import { emptyToUndefinedNumber, optionalPercent } from '../batches/batchSchema'

const schema = z.object({
  name: z.string().trim().min(2, 'Reçete adı girin').max(200),
  version: z.preprocess(emptyToUndefinedNumber, z.number({ invalid_type_error: 'Sürüm girin' }).int().min(1)),
  species_id: z.string().optional(),
  default_treatment: z.string().optional(),
  description: z.string().max(4000).optional(),
  notes: z.string().max(4000).optional(),
  components: z
    .array(
      z.object({
        component_name: z.string().trim().min(1, 'Bileşen adı girin').max(200),
        role: z.enum(['substrat', 'katki', 'su', 'ortu_topragi', 'sonradan_eklenen']),
        proportion_percent: optionalPercent,
        default_moisture_percent: optionalPercent,
        notes: z.string().max(1000).optional(),
      }),
    )
    .min(1, 'En az bir bileşen ekleyin'),
})
type FormValues = z.infer<typeof schema>

export default function RecipeEditor() {
  const { id } = useParams()
  const orgId = useOrgId()
  const { canWrite } = useOrg()
  const { data, error, loading, reload } = useAsync(async () => {
    const c = db()
    const sp = await c.from('species').select('*').or(`organization_id.is.null,organization_id.eq.${orgId}`).order('scientific_name')
    let recipe: SubstrateRecipe | null = null
    let components: RecipeComponent[] = []
    if (id) {
      const [r, comps] = await Promise.all([
        c.from('substrate_recipes').select('*').eq('id', id).single(),
        c.from('recipe_components').select('*').eq('recipe_id', id).order('sort_order'),
      ])
      recipe = unwrap(r) as SubstrateRecipe
      components = unwrap(comps) as RecipeComponent[]
    }
    return { species: unwrap(sp) as Species[], recipe, components }
  }, [id, orgId])

  if (loading && !data) return <Spinner />
  if (error || !data) return <ErrorBox message={error ?? 'Reçete yüklenemedi'} onRetry={() => void reload()} />
  return <RecipeForm key={id ?? 'yeni'} {...data} orgId={orgId} readOnly={!canWrite} />
}

function RecipeForm({
  species,
  recipe,
  components,
  orgId,
  readOnly,
}: {
  species: Species[]
  recipe: SubstrateRecipe | null
  components: RecipeComponent[]
  orgId: string
  readOnly: boolean
}) {
  const navigate = useNavigate()
  const toast = useToast()
  const [error, setError] = useState<string | null>(null)
  const [asNewVersion, setAsNewVersion] = useState(false)
  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: recipe?.name ?? '',
      version: recipe?.version ?? 1,
      species_id: recipe?.species_id ?? '',
      default_treatment: recipe?.default_treatment ?? '',
      description: recipe?.description ?? '',
      notes: recipe?.notes ?? '',
      components: components.length
        ? components.map((c) => ({
            component_name: c.component_name,
            role: c.role,
            proportion_percent: c.proportion_percent ?? undefined,
            default_moisture_percent: c.default_moisture_percent ?? undefined,
            notes: c.notes ?? '',
          }))
        : [{ component_name: '', role: 'substrat', notes: '' }],
    },
  })
  const comps = useFieldArray({ control, name: 'components' })
  const watched = watch('components')
  const sum = (watched ?? [])
    .filter((c) => isInitialSubstrate(c.role))
    .reduce((a, c) => a + (toNumber(c.proportion_percent) ?? 0), 0)
  const anyProportion = (watched ?? []).some((c) => toNumber(c.proportion_percent) !== undefined)

  const onSubmit = handleSubmit(async (v) => {
    setError(null)
    const isNew = !recipe || asNewVersion
    const p_recipe = {
      id: isNew ? null : (recipe?.id ?? null),
      organization_id: orgId,
      name: v.name,
      version: asNewVersion && recipe ? recipe.version + 1 : v.version,
      species_id: v.species_id || null,
      default_treatment: v.default_treatment || null,
      description: v.description || null,
      notes: v.notes || null,
    }
    const p_components = v.components.map((c) => ({
      ...c,
      proportion_percent: c.proportion_percent ?? null,
      default_moisture_percent: c.default_moisture_percent ?? null,
    }))
    const { data: newId, error: err } = await db().rpc('save_recipe', { p_recipe, p_components })
    if (err) {
      setError(friendlyError(err, { unique: 'Bu ad ve sürümle bir reçete zaten var. Sürüm numarasını değiştirin.' }))
      return
    }
    toast.success('Reçete kaydedildi.')
    navigate(`/receteler/${newId as string}`, { replace: true })
  })

  return (
    <>
      <PageHeader
        back={
          <Link to="/receteler" className="mb-1 inline-flex items-center gap-1 text-sm text-muted">
            <ArrowLeft className="size-4" /> Reçeteler
          </Link>
        }
        title={recipe ? `${recipe.name} — sürüm ${recipe.version}` : 'Yeni substrat reçetesi'}
      />
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {error && <Notice tone="danger">{error}</Notice>}
        <fieldset disabled={readOnly} className="space-y-4">
          <Card>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Reçete adı" required error={errors.name?.message}>
                <Input {...register('name')} />
              </Field>
              <Field label="Sürüm" error={errors.version?.message}>
                <Input inputMode="numeric" {...register('version')} readOnly={!!recipe} />
              </Field>
              <Field label="Hedef tür (isteğe bağlı)">
                <Select {...register('species_id')}>
                  <option value="">Genel</option>
                  {species.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.scientific_name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Varsayılan işlem">
                <Select {...register('default_treatment')}>
                  <option value="">Belirtilmedi</option>
                  {options('treatments').map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Açıklama" className="sm:col-span-2">
                <Textarea {...register('description')} rows={2} />
              </Field>
            </div>
          </Card>

          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Bileşenler</h2>
              {!readOnly && (
                <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => comps.append({ component_name: '', role: 'substrat', notes: '' })}>
                  Bileşen ekle
                </Button>
              )}
            </div>
            {errors.components?.message && <p className="mb-2 text-sm text-danger">{errors.components.message}</p>}
            <div className="space-y-3">
              {comps.fields.map((f, i) => {
                const e = errors.components?.[i]
                return (
                  <div key={f.id} className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-12">
                    <Field label="Bileşen" required error={e?.component_name?.message} className="sm:col-span-4">
                      <Input {...register(`components.${i}.component_name`)} />
                    </Field>
                    <Field label="Rol" className="sm:col-span-3">
                      <Select {...register(`components.${i}.role`)}>
                        {options('materialRoles').map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Oran (yaş %)" error={e?.proportion_percent?.message} className="sm:col-span-2">
                      <Input inputMode="decimal" {...register(`components.${i}.proportion_percent`)} />
                    </Field>
                    <Field label="Tipik nem (%)" error={e?.default_moisture_percent?.message} className="sm:col-span-2">
                      <Input inputMode="decimal" {...register(`components.${i}.default_moisture_percent`)} />
                    </Field>
                    <div className="flex items-end sm:col-span-1">
                      {!readOnly && (
                        <Button size="sm" variant="ghost" aria-label="Bileşeni sil" onClick={() => comps.remove(i)}>
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            {anyProportion && (
              <p className={`mt-3 text-xs ${Math.abs(sum - 100) > 0.01 ? 'text-warn' : 'text-muted'}`}>
                Başlangıç substratı bileşenlerinin oran toplamı: %{fmtNumber(sum, 2)}
                {Math.abs(sum - 100) > 0.01 && ' — %100 olması beklenir.'}
              </p>
            )}
            <p className="mt-2 text-xs text-muted">
              Tipik nem değerleri yalnızca parti sihirbazında başlangıç değeri olarak gelir; her partide gerçek ölçülen nem girilmelidir.
            </p>
          </Card>
        </fieldset>

        {!readOnly && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {recipe && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-[var(--color-primary)]" checked={asNewVersion} onChange={(e) => setAsNewVersion(e.target.checked)} />
                Yeni sürüm olarak kaydet (s{recipe.version + 1})
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
