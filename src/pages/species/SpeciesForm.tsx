import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { db } from '../../lib/supabase'
import { friendlyError } from '../../lib/errors'
import { options } from '../../i18n'
import type { CultivationMethod, Species } from '../../lib/types'
import { Button, Field, Input, Modal, Notice, Textarea } from '../../components/ui'
import { useToast } from '../../components/Toast'

const schema = z.object({
  scientific_name: z.string().trim().min(3, 'Bilimsel adı girin (ör. Pleurotus djamor)').max(200),
  turkish_name: z.string().trim().max(200).optional(),
  is_species_group: z.boolean(),
  cultivation_methods: z.array(z.string()),
  substrates: z.string().max(2000).optional(),
  description: z.string().max(4000).optional(),
  source_notes: z.string().max(4000).optional(),
})
type FormValues = z.infer<typeof schema>

/** Bilimsel addan cins/tür sıfatını ayırır. "Flammulina spp." → cins: Flammulina, sıfat: null */
export function splitScientificName(name: string): { genus: string; epithet: string | null; isGroup: boolean } {
  const clean = name.trim().replace(/\s+/g, ' ')
  const isGroup = /\sspp?\.$/.test(clean)
  const [genus, epithet] = clean.replace(/\sspp?\.$/, '').split(' ')
  return { genus: genus ?? clean, epithet: isGroup ? null : (epithet ?? null), isGroup }
}

export function SpeciesFormModal({
  open,
  onClose,
  orgId,
  species,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  orgId: string
  species?: Species
  onSaved: (id: string) => void
}) {
  const toast = useToast()
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      scientific_name: species?.scientific_name ?? '',
      turkish_name: species?.turkish_name ?? '',
      is_species_group: species?.is_species_group ?? false,
      cultivation_methods: species?.cultivation_methods ?? [],
      substrates: species?.substrates.join(', ') ?? '',
      description: species?.description ?? '',
      source_notes: species?.source_notes ?? '',
    },
  })

  const onSubmit = handleSubmit(async (v) => {
    setError(null)
    const parts = splitScientificName(v.scientific_name)
    const row = {
      organization_id: orgId,
      scientific_name: v.scientific_name.trim().replace(/\s+/g, ' '),
      turkish_name: v.turkish_name || null,
      genus: parts.genus,
      specific_epithet: parts.epithet,
      is_species_group: v.is_species_group || parts.isGroup,
      cultivation_methods: v.cultivation_methods as CultivationMethod[],
      substrates: (v.substrates ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      description: v.description || null,
      source_notes: v.source_notes || null,
    }
    const res = species
      ? await db().from('species').update(row).eq('id', species.id).select('id').single()
      : await db().from('species').insert(row).select('id').single()
    if (res.error) {
      setError(friendlyError(res.error, { unique: 'Bu bilimsel adla kayıtlı bir tür zaten var.' }))
      return
    }
    toast.success(species ? 'Tür kartı güncellendi.' : 'Yeni tür eklendi.')
    onSaved((res.data as { id: string }).id)
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={species ? 'Tür kartını düzenle' : 'Yeni mantar türü'}
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
        <Field label="Bilimsel adı" required error={errors.scientific_name?.message} hint="Tür grubu için “Cins spp.” yazın.">
          <Input {...register('scientific_name')} className="italic" />
        </Field>
        <Field label="Türkçe adı">
          <Input {...register('turkish_name')} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-[var(--color-primary)]" {...register('is_species_group')} />
          Bu bir tür grubudur (kesin tür kimliği suş kaydında belirtilecek)
        </label>
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Uygun üretim yöntemleri</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {options('methods').map((o) => (
              <label key={o.value} className="flex items-center gap-2 text-sm">
                <input type="checkbox" value={o.value} className="size-4 accent-[var(--color-primary)]" {...register('cultivation_methods')} />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Kullanılabilen substratlar" hint="Virgülle ayırın.">
          <Input {...register('substrates')} />
        </Field>
        <Field label="Açıklama">
          <Textarea {...register('description')} />
        </Field>
        <Field label="Kaynak bilgileri">
          <Textarea {...register('source_notes')} placeholder="Literatür, kültür koleksiyonu, uzman görüşü…" />
        </Field>
        <p className="text-xs text-muted">
          Sıcaklık, nem, CO₂ ve ışık hedefleri tür kartında değil, suşa/yönteme/aşamaya göre tanımlanan <b>protokollerde</b> tutulur.
        </p>
      </form>
    </Modal>
  )
}
