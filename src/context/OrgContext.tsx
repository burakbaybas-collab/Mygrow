import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { db } from '../lib/supabase'
import type { MemberRole, Membership } from '../lib/types'
import { friendlyError } from '../lib/errors'
import { useAuth } from './AuthContext'

const STORAGE_KEY = 'mygrow.currentOrg'

interface OrgState {
  memberships: Membership[]
  current: Membership | null
  loading: boolean
  error: string | null
  switchOrg: (organizationId: string) => void
  refresh: () => Promise<void>
  /** Kayıt ekleme/düzenleme (sahip, yönetici, personel) */
  canWrite: boolean
  /** Silme, tesis/oda yönetimi, tamamlanmış partiyi düzeltme (sahip, yönetici) */
  canManage: boolean
  isOwner: boolean
}

const OrgContext = createContext<OrgState | null>(null)

const WRITERS: MemberRole[] = ['owner', 'manager', 'staff']
const MANAGERS: MemberRole[] = ['owner', 'manager']

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [currentId, setCurrentId] = useState<string | null>(readStored())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!user) {
      setMemberships([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const { data, error: err } = await db()
      .from('memberships')
      .select('id, organization_id, user_id, role, display_name, email, organization:organizations(id, name, org_type, city, country, created_at)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
    if (err) setError(friendlyError(err))
    else setMemberships((data ?? []) as unknown as Membership[])
    setLoading(false)
  }, [user])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const current = useMemo(
    () => memberships.find((m) => m.organization_id === currentId) ?? memberships[0] ?? null,
    [memberships, currentId],
  )

  const switchOrg = useCallback((organizationId: string) => {
    setCurrentId(organizationId)
    try {
      localStorage.setItem(STORAGE_KEY, organizationId)
    } catch {
      /* depolama kullanılamıyorsa yalnızca bellek içi tutulur */
    }
  }, [])

  const value: OrgState = {
    memberships,
    current,
    loading,
    error,
    switchOrg,
    refresh,
    canWrite: !!current && WRITERS.includes(current.role),
    canManage: !!current && MANAGERS.includes(current.role),
    isOwner: current?.role === 'owner',
  }

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>
}

export function useOrg(): OrgState {
  const ctx = useContext(OrgContext)
  if (!ctx) throw new Error('useOrg, OrgProvider içinde kullanılmalı')
  return ctx
}

/** Aktif işletme kimliği (RequireOrg altında her zaman tanımlıdır) */
export function useOrgId(): string {
  const { current } = useOrg()
  if (!current) throw new Error('Aktif işletme yok')
  return current.organization_id
}
