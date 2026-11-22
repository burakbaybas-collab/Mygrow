import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Sprout } from 'lucide-react'
import { db } from '../../lib/supabase'
import { unwrap, useAsync } from '../../lib/useAsync'
import { useOrg, useOrgId } from '../../context/OrgContext'
import { label } from '../../i18n'
import type { Species } from '../../lib/types'
import { Badge, Button, EmptyState, ErrorBox, PageHeader, SciName, Spinner } from '../../components/ui'
import { SpeciesFormModal } from './SpeciesForm'

export default function SpeciesList() {
  const orgId = useOrgId()
  const { canWrite } = useOrg()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const { data, error, loading, reload } = useAsync(
    async () =>
      unwrap(
        await db()
          .from('species')
          .select('*')
          .or(`organization_id.is.null,organization_id.eq.${orgId}`)
          .order('scientific_name'),
      ) as Species[],
    [orgId],
  )

  return (
    <>
      <PageHeader
        title="Mantar türleri"
        subtitle="Sistem kataloğu bütün işletmelerle paylaşılır ve salt okunurdur. Kendi türlerinizi ekleyebilirsiniz."
        actions={
          canWrite && (
            <Button icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>
              Yeni tür
            </Button>
          )
        }
      />
      {loading && <Spinner />}
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {data?.length === 0 && <EmptyState icon={<Sprout className="size-10" />} title="Tür bulunamadı" />}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {data?.map((s) => (
          <Link
            key={s.id}
            to={`/turler/${s.id}`}
            className="min-w-0 rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-sm transition hover:border-secondary/60"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">
                  <SciName name={s.scientific_name} />
                </p>
                <p className="text-sm text-muted">{s.turkish_name ?? '—'}</p>
              </div>
              <Badge tone={s.organization_id ? 'info' : 'neutral'}>{s.organization_id ? 'İşletmeye özel' : 'Sistem kataloğu'}</Badge>
            </div>
            {s.cultivation_methods.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {s.cultivation_methods.map((m) => (
                  <Badge key={m} tone="green">
                    {label('methods', m)}
                  </Badge>
                ))}
              </div>
            )}
            {s.is_species_group && <p className="mt-2 text-xs text-warn">Tür grubu — kesin tür suş kaydında belirtilir</p>}
          </Link>
        ))}
      </div>
      {open && (
        <SpeciesFormModal
          open
          orgId={orgId}
          onClose={() => setOpen(false)}
          onSaved={(id) => {
            setOpen(false)
            navigate(`/turler/${id}`)
          }}
        />
      )}
    </>
  )
}
