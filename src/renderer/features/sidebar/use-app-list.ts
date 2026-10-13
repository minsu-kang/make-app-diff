import { useEffect, useState } from 'react'
import type { SearchApp } from '../../shared/types'
import { getApi } from '../../shared/api/electron-api'

export function useAppList(refreshKey: number | undefined) {
  const [allApps, setAllApps] = useState<SearchApp[]>([])
  const [loadingApps, setLoadingApps] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoadingApps(true)
    setError(null)
    getApi()
      .ipm.searchApps()
      .then((result) => {
        if (cancelled) return
        if (result.success && result.data) {
          setAllApps(result.data)
        } else {
          setError(result.error || 'Failed to load apps')
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoadingApps(false)
      })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  return { allApps, loadingApps, error, setError }
}
