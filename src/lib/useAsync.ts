import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react'
import { friendlyError } from './errors'

/**
 * Basit veri yükleme kancası. Hata olduğunda boş liste/sahte veri döndürmez;
 * hatayı açıkça bildirir ki ekran yanıltıcı olmasın.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList) {
  const [data, setData] = useState<T | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const seq = useRef(0)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps)

  const reload = useCallback(async () => {
    const id = ++seq.current
    setLoading(true)
    setError(null)
    try {
      const result = await run()
      if (id === seq.current) setData(result)
    } catch (e) {
      if (id === seq.current) setError(friendlyError(e))
    } finally {
      if (id === seq.current) setLoading(false)
    }
  }, [run])

  useEffect(() => {
    void reload()
  }, [reload])

  return { data, error, loading, reload, setData }
}

/** Supabase sorgu sonucunu açar; hata varsa fırlatır. */
export function unwrap<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw res.error
  return res.data as T
}
