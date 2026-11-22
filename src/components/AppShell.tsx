import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  Bell,
  BookOpen,
  Building2,
  ChartColumn,
  CirclePlus,
  FileText,
  FlaskConical,
  House,
  Layers,
  Settings,
  Sprout,
  Users,
} from 'lucide-react'
import { dict } from '../i18n'
import { useOrg } from '../context/OrgContext'
import { displayNameOf, useAuth } from '../context/AuthContext'
import { cx } from './ui'

const t = dict()

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <img src="/icon.svg" alt="" className="size-8" />
      {!compact && (
        <div className="leading-tight">
          <p className="font-semibold tracking-tight text-primary">{t.app.name}</p>
          <p className="hidden text-[11px] text-muted sm:block">{t.app.tagline}</p>
        </div>
      )}
    </div>
  )
}

const sideItems = [
  { to: '/', label: t.nav.home, icon: House, end: true },
  { to: '/partiler', label: t.nav.batches, icon: Layers },
  { to: '/kayit-ekle', label: t.nav.addRecord, icon: CirclePlus },
  { to: '/turler', label: t.nav.species, icon: Sprout },
  { to: '/protokoller', label: t.nav.protocols, icon: BookOpen },
  { to: '/receteler', label: t.nav.recipes, icon: FlaskConical },
  { to: '/tesisler', label: t.nav.facilities, icon: Building2 },
  { to: '/ekip', label: t.nav.team, icon: Users },
  { to: '/analizler', label: t.nav.analytics, icon: ChartColumn },
  { to: '/raporlar', label: t.nav.reports, icon: FileText },
  { to: '/ayarlar', label: t.nav.settings, icon: Settings },
]

const bottomItems = [
  { to: '/', label: t.nav.home, icon: House, end: true },
  { to: '/partiler', label: t.nav.batches, icon: Layers },
  { to: '/kayit-ekle', label: t.nav.addRecord, icon: CirclePlus, primary: true },
  { to: '/analizler', label: t.nav.analytics, icon: ChartColumn },
  { to: '/ayarlar', label: t.nav.settings, icon: Settings },
]

export function AppShell() {
  const { current } = useOrg()
  const { user } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen lg:flex">
      {/* Masaüstü yan menü */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-surface px-3 py-4 lg:flex">
        <div className="px-2 pb-5">
          <Logo />
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto" aria-label="Ana menü">
          {sideItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive ? 'bg-primary-soft text-primary' : 'text-ink/80 hover:bg-canvas',
                )
              }
            >
              <Icon className="size-[18px]" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Üst çubuk */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 py-2.5 backdrop-blur lg:px-8">
          <div className="lg:hidden">
            <Logo compact />
          </div>
          <button
            type="button"
            onClick={() => navigate('/ayarlar')}
            className="min-w-0 flex-1 text-left lg:flex-none"
            title="İşletme ve hesap ayarları"
          >
            <p className="truncate text-sm font-semibold">{current?.organization?.name ?? '—'}</p>
            <p className="truncate text-xs text-muted">{current?.display_name || displayNameOf(user)}</p>
          </button>
          <button
            type="button"
            className="relative rounded-xl p-2 text-muted hover:bg-canvas"
            aria-label="Bildirimler"
            title="Bildirimler: uyarı sistemi Aşama 5'te etkinleşecek"
            onClick={() => navigate('/bildirimler')}
          >
            <Bell className="size-5" />
          </button>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-5 lg:px-8 lg:pb-10">
          <Outlet />
        </main>
      </div>

      {/* Mobil alt menü */}
      <nav
        className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface lg:hidden"
        aria-label="Alt menü"
      >
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {bottomItems.map(({ to, label, icon: Icon, end, primary }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cx(
                    'flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium',
                    isActive ? 'text-primary' : 'text-muted',
                  )
                }
              >
                {primary ? (
                  <span className="-mt-5 flex size-12 items-center justify-center rounded-full bg-primary text-white shadow-lg ring-4 ring-canvas">
                    <Icon className="size-6" aria-hidden />
                  </span>
                ) : (
                  <Icon className="size-5" aria-hidden />
                )}
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
