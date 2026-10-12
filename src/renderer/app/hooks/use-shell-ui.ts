import { useEffect, useState } from 'react'

export function useShellUi() {
  const [showSettings, setShowSettings] = useState(false)
  const [forcedSettings, setForcedSettings] = useState(false)
  const [appListRefreshKey, setAppListRefreshKey] = useState(0)
  const [showDownloadModal, setShowDownloadModal] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    if (!showInfo) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') setShowInfo(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showInfo])

  return {
    showSettings,
    setShowSettings,
    forcedSettings,
    setForcedSettings,
    appListRefreshKey,
    setAppListRefreshKey,
    showDownloadModal,
    setShowDownloadModal,
    showInfo,
    setShowInfo,
    sidebarCollapsed,
    setSidebarCollapsed
  }
}
