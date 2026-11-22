import { Link } from 'react-router-dom'
import { FlaskConical, Plus } from 'lucide-react'
import { db } from '../../lib/supabase'
import { unwrap, useAsync } from '../../lib/useAsync'
import { useOrg, useOrgId } from '../../context/OrgContext'
import { label } from '../../i18n'
import type { RecipeComponent, SubstrateRecipe } from '../../lib/types'
import { Badge, EmptyState, ErrorBox, LinkButton, PageHeader, Spinner } from '../../components/ui'

type Row = SubstrateRecipe & { recipe_components: Pick<RecipeComponent, 'component_name' | 'proportion_percent'>[] }

export default function RecipeList() {
  const orgId = useOrgId()
  const { canWrite } = useOrg()
  const { data, error, loading, reload } = useAsync(
    async () =>
      unwrap(
        await db()
          .from('substrate_recipes')
          .select('*, recipe_components(component_name, proportion_percent)')
          .eq('organization_id', orgId)
          .order('name')
          .order('version', { ascending: false }),
      ) as unknown as Row[],
    [orgId],
  )

  return (
    <>
      <PageHeader
        title="Substrat reçeteleri"
        subtitle="Reçeteler sürümlüdür. Partiler oluşturuldukları andaki reçete adı ve sürümünü saklar."
        actions={
          canWrite && (
            <LinkButton to="/receteler/yeni" icon={<Plus className="size-4" />}>
              Yeni reçete
            </LinkButton>
          )
        }
      />
      {loading && <Spinner />}
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {data?.length === 0 && (
        <EmptyState
          icon={<FlaskConical className="size-10" />}
          title="Henüz reçete yok"
          action={canWrite && <LinkButton to="/receteler/yeni">İlk reçeteyi oluştur</LinkButton>}
        >
          Reçete kullanmadan da parti oluşturabilirsiniz; bileşenler parti sihirbazında elle girilir.
        </EmptyState>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {data?.map((r) => (
          <Link key={r.id} to={`/receteler/${r.id}`} className="rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-sm hover:border-secondary/60">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold">
                {r.name} <span className="text-sm font-normal text-muted">s{r.version}</span>
              </p>
              {r.is_archived && <Badge>Arşivde</Badge>}
            </div>
            <p className="mt-1 text-sm text-muted">
              {r.recipe_components.length
                ? r.recipe_components.map((c) => `${c.component_name}${c.proportion_percent !== null ? ` %${c.proportion_percent}` : ''}`).join(' · ')
                : 'Bileşen yok'}
            </p>
            {r.default_treatment && <p className="mt-2 text-xs text-muted">Varsayılan işlem: {label('treatments', r.default_treatment)}</p>}
          </Link>
        ))}
      </div>
    </>
  )
}
