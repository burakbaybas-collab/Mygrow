import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Plus } from 'lucide-react'
import { db } from '../../lib/supabase'
import { unwrap, useAsync } from '../../lib/useAsync'
import { useOrg, useOrgId } from '../../context/OrgContext'
import { label } from '../../i18n'
import type { Protocol, Species } from '../../lib/types'
import { Badge, EmptyState, ErrorBox, LinkButton, PageHeader, SciName, Select, Spinner } from '../../components/ui'

type Row = Protocol & { species: Pick<Species, 'id' | 'scientific_name' | 'turkish_name'> | null }

export default function ProtocolList() {
  const orgId = useOrgId()
  const { canWrite } = useOrg()
  const [scope, setScope] = useState<'hepsi' | 'isletme' | 'sistem'>('hepsi')
  const { data, error, loading, reload } = useAsync(
    async () =>
      unwrap(
        await db()
          .from('protocols')
          .select('*, species:species(id, scientific_name, turkish_name)')
          .or(`organization_id.is.null,organization_id.eq.${orgId}`)
          .order('name'),
      ) as unknown as Row[],
    [orgId],
  )

  const grouped = useMemo(() => {
    const rows = (data ?? []).filter((p) => (scope === 'hepsi' ? true : scope === 'isletme' ? !!p.organization_id : !p.organization_id))
    const m = new Map<string, { name: string; rows: Row[] }>()
    for (const p of rows) {
      const key = p.species?.id ?? '-'
      const g = m.get(key) ?? { name: p.species?.scientific_name ?? '—', rows: [] }
      g.rows.push(p)
      m.set(key, g)
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [data, scope])

  return (
    <>
      <PageHeader
        title="Yetiştirme protokolleri"
        subtitle="Aşamalar ve hedef koşullar protokol kayıtlarında tutulur. Sistem şablonlarını kopyalayarak kendi protokolünüzü oluşturun."
        actions={
          canWrite && (
            <LinkButton to="/protokoller/yeni" icon={<Plus className="size-4" />}>
              Yeni protokol
            </LinkButton>
          )
        }
      />
      <div className="mb-4 max-w-xs">
        <Select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)} aria-label="Kapsam">
          <option value="hepsi">Bütün protokoller</option>
          <option value="isletme">İşletmemin protokolleri</option>
          <option value="sistem">Sistem şablonları</option>
        </Select>
      </div>
      {loading && <Spinner />}
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {data && grouped.length === 0 && <EmptyState icon={<BookOpen className="size-10" />} title="Protokol yok" />}
      <div className="space-y-5">
        {grouped.map((g) => (
          <section key={g.name}>
            <h2 className="mb-2 text-sm font-semibold">
              <SciName name={g.name} />
            </h2>
            <div className="grid gap-2 md:grid-cols-2">
              {g.rows.map((p) => (
                <Link
                  key={p.id}
                  to={`/protokoller/${p.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 hover:border-secondary/60"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="text-xs text-muted">
                      Sürüm {p.version}
                      {p.cultivation_method ? ` · ${label('methods', p.cultivation_method)}` : ''}
                      {p.organization_id ? '' : ' · Sistem şablonu'}
                      {p.is_archived ? ' · Arşivde' : ''}
                    </p>
                  </div>
                  <Badge tone={p.verification_status === 'dogrulanmamis' ? 'warn' : 'green'}>{label('verification', p.verification_status)}</Badge>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  )
}
