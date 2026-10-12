import { useCallback, useState } from 'react'
import type { AppInfo, DiffResult } from '../../shared/types'
import { getApi } from '../../shared/api/electron-api'

interface AppSelectionDeps {
  invalidateRequests: () => void
  setDiffResult: (value: DiffResult | null) => void
  setSelectedFile: (value: string | null) => void
  setError: (value: string | null) => void
  setDecompile: (value: boolean) => void
}

export function useAppSelection({
  invalidateRequests,
  setDiffResult,
  setSelectedFile,
  setError,
  setDecompile
}: AppSelectionDeps) {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [fromVersion, setFromVersion] = useState('')
  const [toVersion, setToVersion] = useState('')
  const [appIcon, setAppIcon] = useState<string | null>(null)

  const handleFromChange = useCallback(
    (version: string) => {
      invalidateRequests()
      setFromVersion(version)
    },
    [invalidateRequests]
  )

  const handleToChange = useCallback(
    (version: string) => {
      invalidateRequests()
      setToVersion(version)
    },
    [invalidateRequests]
  )

  const handleAppSelect = useCallback(
    (info: AppInfo) => {
      invalidateRequests()
      setAppInfo(info)
      setDiffResult(null)
      setSelectedFile(null)
      setError(null)
      setAppIcon(null)
      setDecompile(true)

      // Fetch app icon from /admin/icon/apps/{appName}
      getApi()
        .ipm.getAppIcon(info.name)
        .then((result) => {
          if (result.success && result.data) {
            setAppIcon(result.data)
          }
        })
        .catch((error: unknown) => {
          console.error('Failed to load app icon', error)
        })

      // Auto-select previous → latest version pairing
      const versions = info.versions || []
      if (versions.length >= 2) {
        setFromVersion(versions[1])
        setToVersion(versions[0])
      } else if (versions.length === 1) {
        setFromVersion('')
        setToVersion(versions[0])
      } else {
        setFromVersion('')
        setToVersion('')
      }
    },
    [invalidateRequests, setDiffResult, setSelectedFile, setError, setDecompile]
  )

  const handleSwap = useCallback(() => {
    invalidateRequests()
    setFromVersion(toVersion)
    setToVersion(fromVersion)
  }, [fromVersion, toVersion, invalidateRequests])

  return { appInfo, fromVersion, toVersion, appIcon, handleFromChange, handleToChange, handleAppSelect, handleSwap }
}
