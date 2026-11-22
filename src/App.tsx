import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { isSupabaseConfigured } from './lib/supabase'
import { AuthProvider, useAuth } from './context/AuthContext'
import { OrgProvider, useOrg } from './context/OrgContext'
import { ToastProvider } from './components/Toast'
import { AppShell } from './components/AppShell'
import { ErrorBox, Spinner } from './components/ui'
import SetupRequired from './pages/SetupRequired'
import Login from './pages/auth/Login'
import Register from './pages/auth/Register'
import CreateOrganization from './pages/CreateOrganization'
import Dashboard from './pages/Dashboard'
import BatchList from './pages/batches/BatchList'
import NewBatchWizard from './pages/batches/NewBatchWizard'
import BatchDetail from './pages/batches/BatchDetail'
import SpeciesList from './pages/species/SpeciesList'
import SpeciesDetail from './pages/species/SpeciesDetail'
import ProtocolList from './pages/protocols/ProtocolList'
import ProtocolEditor from './pages/protocols/ProtocolEditor'
import RecipeList from './pages/recipes/RecipeList'
import RecipeEditor from './pages/recipes/RecipeEditor'
import Facilities from './pages/Facilities'
import Team from './pages/Team'
import Settings from './pages/Settings'
import AddRecord from './pages/AddRecord'
import Upcoming from './pages/Upcoming'

function RequireAuth() {
  const { session, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Spinner label="Oturum kontrol ediliyor…" />
  if (!session) return <Navigate to="/giris" replace state={{ from: location.pathname }} />
  return <Outlet />
}

function RequireOrg() {
  const { memberships, loading, error, refresh } = useOrg()
  if (loading) return <Spinner label="İşletme bilgileri yükleniyor…" />
  if (error)
    return (
      <div className="mx-auto max-w-md p-6">
        <ErrorBox message={error} onRetry={() => void refresh()} />
      </div>
    )
  if (memberships.length === 0) return <Navigate to="/isletme-olustur" replace />
  return <Outlet />
}

function PublicOnly() {
  const { session, loading } = useAuth()
  if (loading) return <Spinner />
  if (session) return <Navigate to="/" replace />
  return <Outlet />
}

export default function App() {
  if (!isSupabaseConfigured) return <SetupRequired />

  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <OrgProvider>
            <Routes>
              <Route element={<PublicOnly />}>
                <Route path="/giris" element={<Login />} />
                <Route path="/kayit" element={<Register />} />
              </Route>
              <Route element={<RequireAuth />}>
                <Route path="/isletme-olustur" element={<CreateOrganization />} />
                <Route element={<RequireOrg />}>
                  <Route element={<AppShell />}>
                    <Route index element={<Dashboard />} />
                    <Route path="partiler" element={<BatchList />} />
                    <Route path="partiler/yeni" element={<NewBatchWizard />} />
                    <Route path="partiler/:id" element={<BatchDetail />} />
                    <Route path="turler" element={<SpeciesList />} />
                    <Route path="turler/:id" element={<SpeciesDetail />} />
                    <Route path="protokoller" element={<ProtocolList />} />
                    <Route path="protokoller/yeni" element={<ProtocolEditor />} />
                    <Route path="protokoller/:id" element={<ProtocolEditor />} />
                    <Route path="receteler" element={<RecipeList />} />
                    <Route path="receteler/yeni" element={<RecipeEditor />} />
                    <Route path="receteler/:id" element={<RecipeEditor />} />
                    <Route path="tesisler" element={<Facilities />} />
                    <Route path="ekip" element={<Team />} />
                    <Route path="ayarlar" element={<Settings />} />
                    <Route path="kayit-ekle" element={<AddRecord />} />
                    <Route path="analizler" element={<Upcoming module="analytics" />} />
                    <Route path="raporlar" element={<Upcoming module="reports" />} />
                    <Route path="bildirimler" element={<Upcoming module="alerts" />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Route>
                </Route>
              </Route>
            </Routes>
          </OrgProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
