import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Supabase bağlantısı yapılandırılmamışsa uygulama sahte veriyle ÇALIŞMAZ;
 * bunun yerine "Kurulum gerekli" ekranını gösterir (bkz. App.tsx).
 */
export const isSupabaseConfigured = Boolean(url && anonKey && !url.includes('PROJE-KIMLIGI'))

let client: SupabaseClient | null = null
if (isSupabaseConfigured) {
  client = createClient(url as string, anonKey as string, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  })
}

/** Yalnızca isSupabaseConfigured === true iken çağrılmalıdır. */
export function db(): SupabaseClient {
  if (!client) throw new Error('Supabase yapılandırılmamış. .env.local dosyasını kontrol edin.')
  return client
}

export const PHOTO_BUCKET = 'batch-photos'
