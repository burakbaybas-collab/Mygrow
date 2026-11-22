import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { db } from '../lib/supabase'
import { friendlyError } from '../lib/errors'
import { displayNameOf, useAuth } from '../context/AuthContext'
import { useOrg } from '../context/OrgContext'
import { options } from '../i18n'
import { Button, Card, Field, Input, Notice, Select } from '../components/ui'
import { AuthLayout } from './auth/AuthLayout'
import { useToast } from '../components/Toast'

const schema = z.object({
  name: z.string().trim().min(2, 'İşletme adı en az 2 karakter olmalı').max(200),
  orgType: z.string().min(1),
  city: z.string().trim().max(100).optional(),
  displayName: z.string().trim().min(2, 'Adınızı girin'),
})
type FormValues = z.infer<typeof schema>

export default function CreateOrganization() {
  const { user, signOut } = useAuth()
  const { refresh, switchOrg, memberships } = useOrg()
  const navigate = useNavigate()
  const toast = useToast()
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { orgType: 'isletme', displayName: displayNameOf(user) },
  })

  const onSubmit = handleSubmit(async (v) => {
    setError(null)
    const { data, error: err } = await db().rpc('create_organization', {
      p_name: v.name,
      p_org_type: v.orgType,
      p_city: v.city ?? null,
      p_display_name: v.displayName,
    })
    if (err) {
      setError(friendlyError(err))
      return
    }
    await refresh()
    switchOrg(data as string)
    toast.success('İşletme oluşturuldu.')
    navigate('/tesisler', { replace: true })
  })

  return (
    <AuthLayout>
      <Card>
        <h1 className="text-lg font-semibold">İşletme oluştur</h1>
        <p className="mt-1 text-sm text-muted">
          Bütün kayıtlarınız bu işletme altında tutulur. Başka işletmeler verilerinize erişemez. Daha sonra yeni işletmeler
          de ekleyebilirsiniz.
        </p>
        <form className="mt-4 space-y-4" onSubmit={onSubmit} noValidate>
          {error && <Notice tone="danger">{error}</Notice>}
          <Field label="İşletme / kurum adı" required error={errors.name?.message}>
            <Input {...register('name')} aria-invalid={!!errors.name} />
          </Field>
          <Field label="Kurum türü">
            <Select {...register('orgType')}>
              {options('orgTypes').map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Şehir">
            <Input {...register('city')} />
          </Field>
          <Field label="Bu işletmede görünecek adınız" required error={errors.displayName?.message}>
            <Input {...register('displayName')} aria-invalid={!!errors.displayName} />
          </Field>
          <Button type="submit" className="w-full" loading={isSubmitting}>
            İşletmeyi oluştur
          </Button>
          {memberships.length > 0 ? (
            <Button variant="ghost" className="w-full" onClick={() => navigate(-1)}>
              Vazgeç
            </Button>
          ) : (
            <Button variant="ghost" className="w-full" onClick={() => void signOut()}>
              Çıkış yap
            </Button>
          )}
        </form>
      </Card>
    </AuthLayout>
  )
}
