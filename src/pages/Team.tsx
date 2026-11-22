import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { db } from '../lib/supabase'
import { unwrap, useAsync } from '../lib/useAsync'
import { friendlyError } from '../lib/errors'
import { useOrg, useOrgId } from '../context/OrgContext'
import { useAuth } from '../context/AuthContext'
import { label, options } from '../i18n'
import type { MemberRole, Membership } from '../lib/types'
import { Badge, Button, Card, ConfirmDialog, ErrorBox, Notice, PageHeader, Select, Spinner } from '../components/ui'
import { useToast } from '../components/Toast'

const ROLE_HELP: Record<MemberRole, string> = {
  owner: 'Her şeyi yönetir; üyeleri ekler/çıkarır, işletmeyi silebilir.',
  manager: 'Tesis/oda tanımlar, kayıt siler, tamamlanmış partileri düzeltir.',
  staff: 'Parti, aşama ve üretim kayıtlarını girer ve düzenler; silemez.',
  viewer: 'Yalnızca görüntüler.',
}

export default function Team() {
  const orgId = useOrgId()
  const { isOwner } = useOrg()
  const { user } = useAuth()
  const toast = useToast()
  const [removing, setRemoving] = useState<Membership | null>(null)
  const { data, error, loading, reload } = useAsync(
    async () =>
      unwrap(await db().from('memberships').select('*').eq('organization_id', orgId).order('created_at')) as Membership[],
    [orgId],
  )

  async function changeRole(m: Membership, role: MemberRole) {
    const { error: err } = await db().from('memberships').update({ role }).eq('id', m.id)
    if (err) return toast.error(friendlyError(err))
    toast.success('Yetki güncellendi.')
    void reload()
  }

  async function remove() {
    if (!removing) return
    const { error: err } = await db().from('memberships').delete().eq('id', removing.id)
    setRemoving(null)
    if (err) return toast.error(friendlyError(err))
    toast.success('Üye işletmeden çıkarıldı.')
    void reload()
  }

  return (
    <>
      <PageHeader title="Ekip ve yetkiler" subtitle="Yetkiler işletme bazındadır; bir kullanıcı farklı işletmelerde farklı yetkilere sahip olabilir." />
      <div className="mb-4">
        <Notice tone="info" title="Üye davet etme">
          E-posta ile üye davet etme, sunucu tarafında güvenli bir davet fonksiyonu (Supabase Edge Function) gerektirdiği için sonraki
          geliştirme aşamasında eklenecek. Şu anda mevcut üyelerin yetkileri bu ekrandan yönetilebilir.
        </Notice>
      </div>
      {loading && <Spinner />}
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {data && (
        <Card>
          <ul className="divide-y divide-line">
            {data.map((m) => (
              <li key={m.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {m.display_name || m.email || 'Adsız üye'}
                    {m.user_id === user?.id && <span className="ml-2 text-xs text-muted">(siz)</span>}
                  </p>
                  <p className="truncate text-xs text-muted">{m.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  {isOwner && m.user_id !== user?.id ? (
                    <>
                      <Select value={m.role} onChange={(e) => void changeRole(m, e.target.value as MemberRole)} aria-label="Yetki" className="min-h-9 py-1.5">
                        {options('roles').map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </Select>
                      <Button size="sm" variant="ghost" aria-label="Üyeyi çıkar" onClick={() => setRemoving(m)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </>
                  ) : (
                    <Badge tone={m.role === 'owner' ? 'green' : 'neutral'}>{label('roles', m.role)}</Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card className="mt-4">
        <h2 className="mb-2 font-semibold">Yetki düzeyleri</h2>
        <ul className="space-y-1.5 text-sm">
          {(Object.keys(ROLE_HELP) as MemberRole[]).map((r) => (
            <li key={r}>
              <b>{label('roles', r)}:</b> <span className="text-muted">{ROLE_HELP[r]}</span>
            </li>
          ))}
        </ul>
      </Card>
      <ConfirmDialog
        open={!!removing}
        danger
        title="Üyeyi çıkar"
        message={`${removing?.display_name || removing?.email || 'Bu üye'} işletmenin hiçbir kaydına erişemeyecek. Girdiği kayıtlar silinmez.`}
        confirmLabel="Çıkar"
        onConfirm={() => void remove()}
        onCancel={() => setRemoving(null)}
      />
    </>
  )
}
