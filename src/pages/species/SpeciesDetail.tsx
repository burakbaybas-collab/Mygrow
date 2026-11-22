import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, BookOpen, Pencil, Plus, Trash2 } from 'lucide-react'
import { db } from '../../lib/supabase'
import { unwrap, useAsync } from '../../lib/useAsync'
import { friendlyError } from '../../lib/errors'
import { useOrg, useOrgId } from '../../context/OrgContext'
import { label, options } from '../../i18n'
import { fmtDate } from '../../lib/format'
import type { Protocol, Species, Strain } from '../../lib/types'
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
  SectionTitle,
  Select,
  Spinner,
  Textarea,
} from '../../components/ui'
import { useToast } from '../../components/Toast'
import { SpeciesFormModal } from './SpeciesForm'

export default function SpeciesDetail() {
  const { id = '' } = useParams()
  const orgId = useOrgId()
  const { canWrite, canManage } = useOrg()
  const navigate = useNavigate()
  const toast = useToast()
  const [editOpen, setEditOpen] = useState(false)
  const [strainOpen, setStrainOpen] = useState<Strain | 'new' | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const { data, error, loading, reload } = useAsync(async () => {
    const c = db()
    const [sp, strains, protocols] = await Promise.all([
      c.from('species').select('*').eq('id', id).single(),
      c.from('strains').select('*').eq('organization_id', orgId).eq('species_id', id).order('code'),
      c.from('protocols').select('*').eq('species_id', id).or(`organization_id.is.null,organization_id.eq.${orgId}`).order('name'),
    ])
    return {
      species: unwrap(sp) as Species,
      strains: unwrap(strains) as Strain[],
      protocols: unwrap(protocols) as Protocol[],
    }
  }, [id, orgId])

  if (loading && !data) return <Spinner />
  if (error || !data) return <ErrorBox message={error ?? 'Tür bulunamadı'} onRetry={() => void reload()} />
  const { species: s, strains, protocols } = data
  const own = s.organization_id === orgId

  async function deleteSpecies() {
    const { error: err } = await db().from('species').delete().eq('id', s.id)
    setConfirmDelete(false)
    if (err) return toast.error(friendlyError(err))
    toast.success('Tür silindi.')
    navigate('/turler', { replace: true })
  }

  return (
    <>
      <PageHeader
        back={
          <Link to="/turler" className="mb-1 inline-flex items-center gap-1 text-sm text-muted">
            <ArrowLeft className="size-4" /> Türler
          </Link>
        }
        title={<SciName name={s.scientific_name} />}
        subtitle={s.turkish_name ?? undefined}
        actions={
          own && (
            <>
              {canWrite && (
                <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setEditOpen(true)}>
                  Düzenle
                </Button>
              )}
              {canManage && (
                <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => setConfirmDelete(true)}>
                  Sil
                </Button>
              )}
            </>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle>Tür bilgi kartı</SectionTitle>
          {!own && (
            <div className="mb-3">
              <Notice tone="info">Sistem kataloğu kaydıdır; düzenlenemez. Farklı bilgiler için kendi türünüzü ekleyebilirsiniz.</Notice>
            </div>
          )}
          <DefinitionList
            items={[
              { label: 'Bilimsel adı', value: <SciName name={s.scientific_name} /> },
              { label: 'Türkçe adı', value: s.turkish_name ?? '—' },
              { label: 'Cins', value: <i>{s.genus}</i> },
              { label: 'Tür', value: s.specific_epithet ? <i>{s.specific_epithet}</i> : s.is_species_group ? 'Tür grubu (spp.)' : '—' },
              {
                label: 'Uygun üretim yöntemleri',
                value: s.cultivation_methods.length ? s.cultivation_methods.map((m) => label('methods', m)).join(', ') : '—',
              },
              { label: 'Kullanılabilen substratlar', value: s.substrates.length ? s.substrates.join(', ') : '—' },
              { label: 'Açıklama', value: s.description ?? '—' },
              { label: 'Kaynak bilgileri', value: s.source_notes ?? '—' },
            ]}
          />
        </Card>

        <Card>
          <SectionTitle
            action={
              canWrite && (
                <Link to={`/protokoller/yeni?tur=${s.id}`} className="text-sm font-medium text-primary">
                  Yeni protokol
                </Link>
              )
            }
          >
            Yetiştirme aşamaları ve hedef koşullar
          </SectionTitle>
          <p className="mb-3 text-xs text-muted">
            Sıcaklık, nem, CO₂ ve ışık hedefleri suşa, üretim yöntemine ve gelişim dönemine göre protokollerde tanımlanır. Sistem
            şablonları yalnızca aşama adlarını içerir; sayısal değerler uydurulmaz.
          </p>
          {protocols.length === 0 ? (
            <p className="text-sm text-muted">Bu tür için protokol yok.</p>
          ) : (
            <ul className="space-y-2">
              {protocols.map((p) => (
                <li key={p.id}>
                  <Link to={`/protokoller/${p.id}`} className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2.5 hover:bg-canvas">
                    <span className="flex min-w-0 items-center gap-2">
                      <BookOpen className="size-4 shrink-0 text-secondary" />
                      <span className="truncate text-sm font-medium">
                        {p.name} <span className="text-muted">s{p.version}</span>
                      </span>
                    </span>
                    <Badge tone={p.verification_status === 'dogrulanmamis' ? 'warn' : 'green'}>{label('verification', p.verification_status)}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <SectionTitle
          action={
            canWrite && (
              <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => setStrainOpen('new')}>
                Suş / izolat ekle
              </Button>
            )
          }
        >
          İşletmenizdeki suş ve izolatlar
        </SectionTitle>
        {strains.length === 0 ? (
          <p className="text-sm text-muted">Bu tür için kayıtlı suş/izolat yok.</p>
        ) : (
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="py-2 pr-2 font-medium">Kod</th>
                  <th className="py-2 pr-2 font-medium">Ad</th>
                  <th className="py-2 pr-2 font-medium">Kaynak</th>
                  <th className="py-2 pr-2 font-medium">Tür kimliği</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {strains.map((st) => (
                  <tr key={st.id} className="border-b border-line/60">
                    <td className="py-2 pr-2 font-medium">
                      {st.code}
                      {!st.is_active && <span className="ml-1 text-xs text-muted">(pasif)</span>}
                    </td>
                    <td className="py-2 pr-2">{st.name ?? '—'}</td>
                    <td className="py-2 pr-2">{st.source_type ? label('strainSources', st.source_type) : '—'}</td>
                    <td className="py-2 pr-2">
                      <Badge tone={st.identity_status === 'dogrulanmis' ? 'green' : 'warn'}>{label('identity', st.identity_status)}</Badge>
                      {st.exact_species_name && (
                        <span className="ml-1 text-xs">
                          <SciName name={st.exact_species_name} />
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      {canWrite && (
                        <Button size="sm" variant="ghost" onClick={() => setStrainOpen(st)} aria-label={`${st.code} düzenle`}>
                          <Pencil className="size-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editOpen && (
        <SpeciesFormModal
          open
          orgId={orgId}
          species={s}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false)
            void reload()
          }}
        />
      )}
      {strainOpen && (
        <StrainModal
          species={s}
          orgId={orgId}
          strain={strainOpen === 'new' ? undefined : strainOpen}
          onClose={() => setStrainOpen(null)}
          onSaved={() => {
            setStrainOpen(null)
            void reload()
          }}
        />
      )}
      <ConfirmDialog
        open={confirmDelete}
        danger
        title="Türü sil"
        message="Bu türe bağlı suş, protokol veya parti varsa silme işlemi engellenir ve hiçbir kayıt kaybolmaz."
        confirmLabel="Sil"
        onConfirm={() => void deleteSpecies()}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  )
}

const strainSchema = z
  .object({
    code: z.string().trim().min(1, 'Suş/izolat kodu girin').max(60),
    name: z.string().trim().max(200).optional(),
    source_type: z.string().optional(),
    origin: z.string().trim().max(500).optional(),
    identity_status: z.enum(['dogrulanmis', 'dogrulanmamis', 'bilinmiyor']),
    exact_species_name: z.string().trim().max(200).optional(),
    collection_reference: z.string().trim().max(200).optional(),
    isolation_date: z.string().optional(),
    is_active: z.boolean(),
    notes: z.string().max(4000).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.identity_status === 'dogrulanmis' && !v.exact_species_name) {
      ctx.addIssue({ code: 'custom', path: ['exact_species_name'], message: 'Doğrulanmış kimlik için kesin tür adını girin' })
    }
  })
type StrainValues = z.infer<typeof strainSchema>

function StrainModal({
  species,
  orgId,
  strain,
  onClose,
  onSaved,
}: {
  species: Species
  orgId: string
  strain?: Strain
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useToast()
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<StrainValues>({
    resolver: zodResolver(strainSchema),
    defaultValues: {
      code: strain?.code ?? '',
      name: strain?.name ?? '',
      source_type: strain?.source_type ?? '',
      origin: strain?.origin ?? '',
      identity_status: strain?.identity_status ?? 'dogrulanmamis',
      exact_species_name: strain?.exact_species_name ?? (species.is_species_group ? '' : species.scientific_name),
      collection_reference: strain?.collection_reference ?? '',
      isolation_date: strain?.isolation_date ?? '',
      is_active: strain?.is_active ?? true,
      notes: strain?.notes ?? '',
    },
  })

  const onSubmit = handleSubmit(async (v) => {
    setError(null)
    const row = {
      organization_id: orgId,
      species_id: species.id,
      code: v.code,
      name: v.name || null,
      source_type: v.source_type || null,
      origin: v.origin || null,
      identity_status: v.identity_status,
      exact_species_name: v.exact_species_name || null,
      collection_reference: v.collection_reference || null,
      isolation_date: v.isolation_date || null,
      is_active: v.is_active,
      notes: v.notes || null,
    }
    const res = strain ? await db().from('strains').update(row).eq('id', strain.id) : await db().from('strains').insert(row)
    if (res.error) {
      setError(friendlyError(res.error, { unique: 'Bu suş kodu işletmenizde zaten kullanılıyor.' }))
      return
    }
    toast.success(strain ? 'Suş güncellendi.' : 'Suş/izolat eklendi.')
    onSaved()
  })

  return (
    <Modal
      open
      onClose={onClose}
      title={strain ? `${strain.code} düzenle` : 'Yeni suş / izolat'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button loading={isSubmitting} onClick={() => void onSubmit()}>
            Kaydet
          </Button>
        </>
      }
    >
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={onSubmit} noValidate>
        {error && (
          <div className="sm:col-span-2">
            <Notice tone="danger">{error}</Notice>
          </div>
        )}
        <Field label="Kod" required error={errors.code?.message}>
          <Input {...register('code')} placeholder="ör. PO-YLV-01" />
        </Field>
        <Field label="Ad">
          <Input {...register('name')} />
        </Field>
        <Field label="Kaynak">
          <Select {...register('source_type')}>
            <option value="">Belirtilmedi</option>
            {options('strainSources').map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Köken / toplama yeri">
          <Input {...register('origin')} />
        </Field>
        <Field label="Tür kimliği durumu">
          <Select {...register('identity_status')}>
            {options('identity').map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Kesin tür adı"
          error={errors.exact_species_name?.message}
          hint={species.is_species_group ? 'Tür grubu: yalnızca doğrulanmışsa kesin türü yazın.' : undefined}
        >
          <Input {...register('exact_species_name')} className="italic" />
        </Field>
        <Field label="Koleksiyon / erişim no">
          <Input {...register('collection_reference')} />
        </Field>
        <Field label="İzolasyon tarihi">
          <Input type="date" {...register('isolation_date')} />
        </Field>
        <Field label="Notlar" className="sm:col-span-2">
          <Textarea {...register('notes')} />
        </Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" className="size-4 accent-[var(--color-primary)]" {...register('is_active')} />
          Aktif (yeni partilerde seçilebilir)
        </label>
        {strain?.isolation_date && <p className="text-xs text-muted sm:col-span-2">Kayıtlı izolasyon tarihi: {fmtDate(strain.isolation_date)}</p>}
      </form>
    </Modal>
  )
}
