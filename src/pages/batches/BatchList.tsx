import { useMemo, useState } from 'react'
import { Layers, Plus } from 'lucide-react'
import { db } from '../../lib/supabase'
import { unwrap, useAsync } from '../../lib/useAsync'
import { useOrg, useOrgId } from '../../context/OrgContext'
import type { Batch, BatchStatus } from '../../lib/types'
import { options } from '../../i18n'
import { EmptyState, ErrorBox, Input, LinkButton, PageHeader, Select, Spinner } from '../../components/ui'
import { BatchCard } from '../Dashboard'

export default function BatchList() {
  const orgId = useOrgId()
  const { canWrite } = useOrg()
  const [status, setStatus] = useState<BatchStatus | 'hepsi'>('aktif')
  const [q, setQ] = useState('')
  const [speciesId, setSpeciesId] = useState('')

  const { data, error, loading, reload } = useAsync(async () => {
    let query = db()
      .from('batches')
      .select(
        'id, batch_code, start_date, inoculation_date, status, current_stage_name, current_stage_category, last_record_at, unit_count, is_demo, cultivation_method, species:species(id, scientific_name, turkish_name, is_species_group), strain:strains(id, code, name, identity_status, exact_species_name), room:rooms(id, name)',
      )
      .eq('organization_id', orgId)
      .order('start_date', { ascending: false })
      .limit(500)
    if (status !== 'hepsi') query = query.eq('status', status)
    return unwrap(await query) as unknown as Batch[]
  }, [orgId, status])

  const speciesOptions = useMemo(() => {
    const m = new Map<string, string>()
    for (const b of data ?? []) if (b.species) m.set(b.species.id, b.species.scientific_name)
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [data])

  const filtered = (data ?? []).filter(
    (b) =>
      (!q || b.batch_code.toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr'))) &&
      (!speciesId || b.species?.id === speciesId),
  )

  return (
    <>
      <PageHeader
        title="Üretim partileri"
        actions={
          canWrite && (
            <LinkButton to="/partiler/yeni" icon={<Plus className="size-4" />}>
              Yeni parti
            </LinkButton>
          )
        }
      />
      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        <Input placeholder="Parti kodu ara…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Parti kodu ara" />
        <Select value={status} onChange={(e) => setStatus(e.target.value as BatchStatus | 'hepsi')} aria-label="Durum">
          {options('batchStatus').map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
          <option value="hepsi">Tümü</option>
        </Select>
        <Select value={speciesId} onChange={(e) => setSpeciesId(e.target.value)} aria-label="Tür">
          <option value="">Bütün türler</option>
          {speciesOptions.map(([id, n]) => (
            <option key={id} value={id}>
              {n}
            </option>
          ))}
        </Select>
      </div>
      {loading && <Spinner />}
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {data && filtered.length === 0 && (
        <EmptyState icon={<Layers className="size-10" />} title="Bu filtreye uyan parti yok" />
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((b) => (
          <BatchCard key={b.id} batch={b} />
        ))}
      </div>
    </>
  )
}
