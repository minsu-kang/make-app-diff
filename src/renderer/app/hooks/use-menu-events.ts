import { useEffect } from 'react'
import { getMenuEvents } from '../../shared/api/electron-api'

interface MenuEventSetters {
  setShowSettings: (value: boolean) => void
  setShowDownloadModal: (value: boolean) => void
  setShowInfo: (value: boolean) => void
}

export function useMenuEvents({ setShowSettings, setShowDownloadModal, setShowInfo }: MenuEventSetters) {
  useEffect(() => {
    const cleanupSettings = getMenuEvents().openSettings(() => setShowSettings(true))
    const cleanupDownload = getMenuEvents().downloadApp(() => setShowDownloadModal(true))
    const cleanupInfo = getMenuEvents().showInfo(() => setShowInfo(true))
    return () => {
      cleanupSettings()
      cleanupDownload()
      cleanupInfo()
    }
  }, [setShowSettings, setShowDownloadModal, setShowInfo])
}
