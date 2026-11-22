import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Building2, DoorOpen, Pencil, Plus, Trash2 } from 'lucide-react'
import { db } from '../lib/supabase'
import { unwrap, useAsync } from '../lib/useAsync'
import { friendlyError } from '../lib/errors'
import { useOrg, useOrgId } from '../context/OrgContext'
import { label, options } from '../i18n'
import { fmtNumber } from '../lib/format'
import type { Facility, Room } from '../lib/types'
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorBox,
  Field,
  Input,
  Modal,
  Notice,
  PageHeader,
  Select,
  Spinner,
  Textarea,
} from '../components/ui'
import { useToast } from '../components/Toast'
import { emptyToUndefinedNumber } from './batches/batchSchema'

export default function Facilities() {
  const orgId = useOrgId()
  const { canManage } = useOrg()
  const toast = useToast()
  const [facilityModal, setFacilityModal] = useState<Facility | 'new' | null>(null)
  const [roomModal, setRoomModal] = useState<{ facility: Facility; room?: Room } | null>(null)
  const [toDelete, setToDelete] = useState<{ kind: 'facility' | 'room'; id: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState(false)

  const { data, error, loading, reload } = useAsync(async () => {
    const c = db()
    const [f, r] = await Promise.all([
      c.from('facilities').select('*').eq('organization_id', orgId).order('name'),
      c.from('rooms').select('*').eq('organization_id', orgId).order('name'),
    ])
    return { facilities: unwrap(f) as Facility[], rooms: unwrap(r) as Room[] }
  }, [orgId])

  async function doDelete() {
    if (!toDelete) return
    setDeleting(true)
    const { error: err } = await db()
      .from(toDelete.kind === 'facility' ? 'facilities' : 'rooms')
      .delete()
      .eq('id', toDelete.id)
    setDeleting(false)
    setToDelete(null)
    if (err) return toast.error(friendlyError(err))
    toast.success(`${toDelete.name} silindi.`)
    void reload()
  }

  return (
    <>
      <PageHeader
        title="Tesis ve üretim odaları"
        subtitle="Her işletmede birden fazla tesis, her tesiste birden fazla oda tanımlanabilir."
        actions={
          canManage && (
            <Button icon={<Plus className="size-4" />} onClick={() => setFacilityModal('new')}>
              Yeni tesis
            </Button>
          )
        }
      />
      {!canManage && (
        <div className="mb-4">
          <Notice tone="info">Tesis ve oda tanımlarını işletme sahibi veya yönetici düzenleyebilir.</Notice>
        </div>
      )}
      {loading && <Spinner />}
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {data?.facilities.length === 0 && (
        <EmptyState
          icon={<Building2 className="size-10" />}
          title="Henüz tesis yok"
          action={canManage && <Button onClick={() => setFacilityModal('new')}>İlk tesisi ekle</Button>}
        >
          Üretim partileri bir tesise ve isteğe bağlı olarak bir üretim odasına bağlanır.
        </EmptyState>
      )}
      <div className="space-y-4">
        {data?.facilities.map((f) => {
          const rooms = data.rooms.filter((r) => r.facility_id === f.id)
          return (
            <Card key={f.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="flex items-center gap-2 font-semibold">
                    <Building2 className="size-5 text-secondary" /> {f.name}
                  </h2>
                  <p className="text-sm text-muted">{[f.city, f.address].filter(Boolean).join(' · ') || 'Adres girilmemiş'}</p>
                </div>
                {canManage && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => setRoomModal({ facility: f })}>
                      Oda ekle
                    </Button>
                    <Button size="sm" variant="ghost" aria-label="Tesisi düzenle" onClick={() => setFacilityModal(f)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button size="sm" variant="ghost" aria-label="Tesisi sil" onClick={() => setToDelete({ kind: 'facility', id: f.id, name: f.name })}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                )}
              </div>
              {rooms.length === 0 ? (
                <p className="mt-3 text-sm text-muted">Bu tesiste oda tanımlanmamış.</p>
              ) : (
                <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {rooms.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                          <DoorOpen className="size-4 shrink-0 text-secondary" /> {r.name}
                        </p>
                        <p className="text-xs text-muted">
                          {label('roomTypes', r.room_type)}
                          {r.area_m2 ? ` · ${fmtNumber(r.area_m2, 1)} m²` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        {!r.is_active && <Badge>Pasif</Badge>}
                        {canManage && (
                          <>
                            <Button size="sm" variant="ghost" aria-label="Odayı düzenle" onClick={() => setRoomModal({ facility: f, room: r })}>
                              <Pencil className="size-4" />
                            </Button>
                            <Button size="sm" variant="ghost" aria-label="Odayı sil" onClick={() => setToDelete({ kind: 'room', id: r.id, name: r.name })}>
                              <Trash2 className="size-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )
        })}
      </div>

      {facilityModal && (
        <FacilityModal
          orgId={orgId}
          facility={facilityModal === 'new' ? undefined : facilityModal}
          onClose={() => setFacilityModal(null)}
          onSaved={() => {
            setFacilityModal(null)
            void reload()
          }}
        />
      )}
      {roomModal && (
        <RoomModal
          orgId={orgId}
          facility={roomModal.facility}
          room={roomModal.room}
          onClose={() => setRoomModal(null)}
          onSaved={() => {
            setRoomModal(null)
            void reload()
          }}
        />
      )}
      <ConfirmDialog
        open={!!toDelete}
        danger
        loading={deleting}
        title={toDelete?.kind === 'facility' ? 'Tesisi sil' : 'Odayı sil'}
        message={
          <>
            <b>{toDelete?.name}</b> silinecek. Bu kayda bağlı oda, parti veya iklim ölçümü varsa silme işlemi veri tabanı tarafından
            engellenir ve hiçbir kayıt kaybolmaz. Kullanılmayan odaları silmek yerine “pasif” yapabilirsiniz.
          </>
        }
        confirmLabel="Sil"
        onConfirm={() => void doDelete()}
        onCancel={() => setToDelete(null)}
      />
    </>
  )
}

const facilitySchema = z.object({
  name: z.string().trim().min(1, 'Tesis adı girin').max(200),
  city: z.string().trim().max(100).optional(),
  address: z.string().trim().max(500).optional(),
  notes: z.string().max(2000).optional(),
})
type FacilityValues = z.infer<typeof facilitySchema>

function FacilityModal({ orgId, facility, onClose, onSaved }: { orgId: string; facility?: Facility; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FacilityValues>({
    resolver: zodResolver(facilitySchema),
    defaultValues: { name: facility?.name ?? '', city: facility?.city ?? '', address: facility?.address ?? '', notes: facility?.notes ?? '' },
  })
  const onSubmit = handleSubmit(async (v) => {
    setError(null)
    const row = { organization_id: orgId, name: v.name, city: v.city || null, address: v.address || null, notes: v.notes || null }
    const res = facility ? await db().from('facilities').update(row).eq('id', facility.id) : await db().from('facilities').insert(row)
    if (res.error) return setError(friendlyError(res.error, { unique: 'Bu adla bir tesis zaten var.' }))
    toast.success(facility ? 'Tesis güncellendi.' : 'Tesis eklendi.')
    onSaved()
  })
  return (
    <Modal
      open
      onClose={onClose}
      title={facility ? 'Tesisi düzenle' : 'Yeni tesis'}
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
      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        {error && <Notice tone="danger">{error}</Notice>}
        <Field label="Tesis adı" required error={errors.name?.message}>
          <Input {...register('name')} />
        </Field>
        <Field label="Şehir">
          <Input {...register('city')} />
        </Field>
        <Field label="Adres">
          <Input {...register('address')} />
        </Field>
        <Field label="Notlar">
          <Textarea {...register('notes')} />
        </Field>
      </form>
    </Modal>
  )
}

const roomSchema = z.object({
  name: z.string().trim().min(1, 'Oda adı girin').max(200),
  room_type: z.enum(['hazirlik', 'inkubasyon', 'uretim', 'laboratuvar', 'depo', 'diger']),
  area_m2: z.preprocess(emptyToUndefinedNumber, z.number({ invalid_type_error: 'Sayı girin' }).gt(0, 'Sıfırdan büyük olmalı').optional()),
  is_active: z.boolean(),
  notes: z.string().max(2000).optional(),
})
type RoomValues = z.infer<typeof roomSchema>

function RoomModal({
  orgId,
  facility,
  room,
  onClose,
  onSaved,
}: {
  orgId: string
  facility: Facility
  room?: Room
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useToast()
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RoomValues>({
    resolver: zodResolver(roomSchema),
    defaultValues: {
      name: room?.name ?? '',
      room_type: room?.room_type ?? 'uretim',
      area_m2: room?.area_m2 ?? undefined,
      is_active: room?.is_active ?? true,
      notes: room?.notes ?? '',
    },
  })
  const onSubmit = handleSubmit(async (v) => {
    setError(null)
    const row = {
      organization_id: orgId,
      facility_id: facility.id,
      name: v.name,
      room_type: v.room_type,
      area_m2: v.area_m2 ?? null,
      is_active: v.is_active,
      notes: v.notes || null,
    }
    const res = room ? await db().from('rooms').update(row).eq('id', room.id) : await db().from('rooms').insert(row)
    if (res.error) return setError(friendlyError(res.error, { unique: 'Bu tesiste aynı adla bir oda zaten var.' }))
    toast.success(room ? 'Oda güncellendi.' : 'Oda eklendi.')
    onSaved()
  })
  return (
    <Modal
      open
      onClose={onClose}
      title={room ? 'Odayı düzenle' : `${facility.name} — yeni oda`}
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
      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        {error && <Notice tone="danger">{error}</Notice>}
        <Field label="Oda adı" required error={errors.name?.message}>
          <Input {...register('name')} placeholder="ör. İnkübasyon 1" />
        </Field>
        <Field label="Oda tipi">
          <Select {...register('room_type')}>
            {options('roomTypes').map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Alan (m²)" error={errors.area_m2?.message}>
          <Input inputMode="decimal" {...register('area_m2')} />
        </Field>
        <Field label="Notlar">
          <Textarea {...register('notes')} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-[var(--color-primary)]" {...register('is_active')} />
          Aktif (yeni partilerde seçilebilir)
        </label>
      </form>
    </Modal>
  )
}
