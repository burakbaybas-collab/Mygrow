import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BookOpen, Building2, ChevronRight, FlaskConical, LogOut, Plus, Sprout, Users } from 'lucide-react'
import { db } from '../lib/supabase'
import { friendlyError } from '../lib/errors'
import { useOrg } from '../context/OrgContext'
import { displayNameOf, useAuth } from '../context/AuthContext'
import { label, options } from '../i18n'
import { Button, Card, Field, Input, Select, SectionTitle } from '../components/ui'
import { useToast } from '../components/Toast'

export default function Settings() {
  const { memberships, current, switchOrg, canManage, refresh } = useOrg()
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const org = current?.organization
  const [name, setName] = useState(org?.name ?? '')
  const [city, setCity] = useState(org?.city ?? '')
  const [saving, setSaving] = useState(false)

  // İşletme değiştirildiğinde formu yeni işletmenin bilgileriyle doldur
  useEffect(() => {
    setName(org?.name ?? '')
    setCity(org?.city ?? '')
  }, [org?.id, org?.name, org?.city])

  async function saveOrg() {
    if (!org) return
    if (name.trim().length < 2) return toast.error('İşletme adı en az 2 karakter olmalı.')
    setSaving(true)
    const { error } = await db().from('organizations').update({ name: name.trim(), city: city.trim() || null }).eq('id', org.id)
    setSaving(false)
    if (error) return toast.error(friendlyError(error))
    toast.success('İşletme bilgileri güncellendi.')
    await refresh()
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold sm:text-2xl">Ayarlar</h1>

      <Card>
        <SectionTitle>Aktif işletme</SectionTitle>
        {memberships.length > 1 && (
          <Field label="İşletme değiştir" className="mb-4">
            <Select value={current?.organization_id} onChange={(e) => switchOrg(e.target.value)}>
              {memberships.map((m) => (
                <option key={m.organization_id} value={m.organization_id}>
                  {m.organization?.name} — {label('roles', m.role)}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="İşletme adı">
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canManage} />
          </Field>
          <Field label="Şehir">
            <Input value={city} onChange={(e) => setCity(e.target.value)} disabled={!canManage} />
          </Field>
          <p className="text-sm text-muted">
            Kurum türü: {label('orgTypes', org?.org_type)} · Yetkiniz: <b>{label('roles', current?.role)}</b>
          </p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {canManage && (
            <Button onClick={() => void saveOrg()} loading={saving}>
              Kaydet
            </Button>
          )}
          <Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => navigate('/isletme-olustur')}>
            Yeni işletme oluştur
          </Button>
        </div>
      </Card>

      <Card className="lg:hidden">
        <SectionTitle>Yönetim</SectionTitle>
        <ul className="divide-y divide-line">
          {[
            { to: '/turler', label: 'Türler ve suşlar', icon: Sprout },
            { to: '/protokoller', label: 'Protokoller', icon: BookOpen },
            { to: '/receteler', label: 'Substrat reçeteleri', icon: FlaskConical },
            { to: '/tesisler', label: 'Tesis ve odalar', icon: Building2 },
            { to: '/ekip', label: 'Ekip ve yetkiler', icon: Users },
          ].map(({ to, label: l, icon: Icon }) => (
            <li key={to}>
              <Link to={to} className="flex min-h-12 items-center justify-between gap-2 py-2 text-sm">
                <span className="flex items-center gap-3">
                  <Icon className="size-5 text-secondary" /> {l}
                </span>
                <ChevronRight className="size-4 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <SectionTitle>Hesap</SectionTitle>
        <p className="text-sm">{displayNameOf(user)}</p>
        <p className="text-sm text-muted">{user?.email}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Dil" hint="Altyapı çok dilli; İngilizce sonraki sürümlerde eklenecek.">
            <Select value="tr" disabled>
              <option value="tr">Türkçe</option>
            </Select>
          </Field>
          <Field label="Tema" hint="Koyu tema sonraki sürümlerde eklenecek.">
            <Select value="light" disabled>
              <option value="light">Açık</option>
            </Select>
          </Field>
        </div>
        <Button variant="secondary" className="mt-4" icon={<LogOut className="size-4" />} onClick={() => void signOut()}>
          Çıkış yap
        </Button>
      </Card>

      <p className="text-center text-xs text-muted">
        MyGrow 1.0 · Rol seçenekleri: {options('roles').map((o) => o.label).join(', ')}
      </p>
    </div>
  )
}
