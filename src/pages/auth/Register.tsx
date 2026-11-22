import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '../../context/AuthContext'
import { friendlyError } from '../../lib/errors'
import { Button, Card, Field, Input, Notice } from '../../components/ui'
import { AuthLayout } from './AuthLayout'

const schema = z
  .object({
    fullName: z.string().trim().min(2, 'Ad soyad en az 2 karakter olmalı'),
    email: z.string().trim().email('Geçerli bir e-posta adresi girin'),
    password: z.string().min(8, 'Parola en az 8 karakter olmalı'),
    passwordAgain: z.string(),
  })
  .refine((v) => v.password === v.passwordAgain, { path: ['passwordAgain'], message: 'Parolalar eşleşmiyor' })
type FormValues = z.infer<typeof schema>

export default function Register() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [confirmSent, setConfirmSent] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const onSubmit = handleSubmit(async (v) => {
    setError(null)
    try {
      const { needsEmailConfirmation } = await signUp(v.email, v.password, v.fullName)
      if (needsEmailConfirmation) setConfirmSent(true)
      else navigate('/isletme-olustur', { replace: true })
    } catch (e) {
      setError(friendlyError(e))
    }
  })

  return (
    <AuthLayout>
      <Card>
        <h1 className="text-lg font-semibold">Hesap oluştur</h1>
        {confirmSent ? (
          <div className="mt-4 space-y-4">
            <Notice tone="info" title="E-postanızı doğrulayın">
              Hesabınız oluşturuldu. Gelen kutunuza gönderilen bağlantıya tıkladıktan sonra giriş yapabilirsiniz.
            </Notice>
            <Link to="/giris" className="block text-center text-sm font-medium text-primary underline">
              Giriş sayfasına dön
            </Link>
          </div>
        ) : (
          <form className="mt-4 space-y-4" onSubmit={onSubmit} noValidate>
            {error && <Notice tone="danger">{error}</Notice>}
            <Field label="Ad soyad" error={errors.fullName?.message}>
              <Input autoComplete="name" {...register('fullName')} aria-invalid={!!errors.fullName} />
            </Field>
            <Field label="E-posta" error={errors.email?.message}>
              <Input type="email" autoComplete="email" inputMode="email" {...register('email')} aria-invalid={!!errors.email} />
            </Field>
            <Field label="Parola" error={errors.password?.message}>
              <Input type="password" autoComplete="new-password" {...register('password')} aria-invalid={!!errors.password} />
            </Field>
            <Field label="Parola (tekrar)" error={errors.passwordAgain?.message}>
              <Input type="password" autoComplete="new-password" {...register('passwordAgain')} aria-invalid={!!errors.passwordAgain} />
            </Field>
            <Button type="submit" className="w-full" loading={isSubmitting}>
              Kayıt ol
            </Button>
          </form>
        )}
        {!confirmSent && (
          <p className="mt-4 text-center text-sm text-muted">
            Zaten hesabınız var mı?{' '}
            <Link to="/giris" className="font-medium text-primary underline">
              Giriş yapın
            </Link>
          </p>
        )}
      </Card>
    </AuthLayout>
  )
}
