import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '../../context/AuthContext'
import { friendlyError } from '../../lib/errors'
import { Button, Card, Field, Input, Notice } from '../../components/ui'
import { AuthLayout } from './AuthLayout'

const schema = z.object({
  email: z.string().trim().email('Geçerli bir e-posta adresi girin'),
  password: z.string().min(1, 'Parola girin'),
})
type FormValues = z.infer<typeof schema>

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const onSubmit = handleSubmit(async (v) => {
    setError(null)
    try {
      await signIn(v.email, v.password)
      const from = (location.state as { from?: string } | null)?.from ?? '/'
      navigate(from, { replace: true })
    } catch (e) {
      setError(friendlyError(e))
    }
  })

  return (
    <AuthLayout>
      <Card>
        <h1 className="text-lg font-semibold">Giriş yap</h1>
        <form className="mt-4 space-y-4" onSubmit={onSubmit} noValidate>
          {error && <Notice tone="danger">{error}</Notice>}
          <Field label="E-posta" error={errors.email?.message}>
            <Input type="email" autoComplete="email" inputMode="email" {...register('email')} aria-invalid={!!errors.email} />
          </Field>
          <Field label="Parola" error={errors.password?.message}>
            <Input type="password" autoComplete="current-password" {...register('password')} aria-invalid={!!errors.password} />
          </Field>
          <Button type="submit" className="w-full" loading={isSubmitting}>
            Giriş yap
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted">
          Hesabınız yok mu?{' '}
          <Link to="/kayit" className="font-medium text-primary underline">
            Kayıt olun
          </Link>
        </p>
      </Card>
    </AuthLayout>
  )
}
