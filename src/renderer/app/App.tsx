import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import type { AppInfo, FileDiff, DiffResult } from '../shared/types'
import Sidebar from '../features/sidebar/Sidebar'
import Settings from '../features/settings/Settings'
import DownloadModal from '../features/download/DownloadModal'
import VersionSelector from '../features/version-selector/VersionSelector'
import ComponentTabs from '../features/diff/ComponentTabs'
import FileTree from '../features/diff/FileTree'
import DiffViewer from '../features/diff/DiffViewer'
import ToastContainer, { showToast } from '../shared/ui/Toast'
import { getApi, getMenuEvents } from '../shared/api/electron-api'
import EmptyState from './EmptyState'
import AboutModal from './AboutModal'

type TabType = 'app' | 'account' | 'hook'

function filterDiffs(diffs: FileDiff[], tab: TabType): FileDiff[] {
  return diffs.filter((d) => {
    const isAccount = d.filePath.startsWith('accounts/') || d.filePath.startsWith('connections/')
    const isHook = d.filePath.startsWith('hooks/') || d.filePath.startsWith('webhooks/')
    if (tab === 'account') return isAccount
    if (tab === 'hook') return isHook
    return !isAccount && !isHook
  })
}

function countChanges(diffs: FileDiff[]): { added: number; deleted: number; modified: number } {
  return {
    added: diffs.filter((d) => d.status === 'added').length,
    deleted: diffs.filter((d) => d.status === 'deleted').length,
    modified: diffs.filter((d) => d.status === 'modified').length
  }
}

export default function App() {
  const [showSettings, setShowSettings] = useState(false)
  const [forcedSettings, setForcedSettings] = useState(false)
  const [appListRefreshKey, setAppListRefreshKey] = useState(0)
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [fromVersion, setFromVersion] = useState('')
  const [toVersion, setToVersion] = useState('')
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null)
  const [activeTab, setActiveTab] = useState<TabType>('app')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [showDownloadModal, setShowDownloadModal] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [appIcon, setAppIcon] = useState<string | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [viewMode, setViewMode] = useState<'diff' | 'show'>('diff')
  const [decompile, setDecompile] = useState(true)
  // Bumped whenever a Show/Compare starts or the selected app changes, so a response for an older request is dropped
  const requestIdRef = useRef(0)

  useEffect(() => {
    const cleanupSettings = getMenuEvents().openSettings(() => setShowSettings(true))
    const cleanupDownload = getMenuEvents().downloadApp(() => setShowDownloadModal(true))
    const cleanupInfo = getMenuEvents().showInfo(() => setShowInfo(true))
    getApi()
      .theme.load()
      .then((theme) => {
        document.documentElement.dataset.theme = theme
      })
      .catch((error: unknown) => console.error('Failed to load the theme', error))

    // Check session expiry, then check if token exists
    getApi()
      .session.check()
      .then(({ expired }) => {
        if (expired) {
          showToast('Session expired (48h inactive). Please re-enter your tokens.', 'error')
          setForcedSettings(true)
          setShowSettings(true)
          return
        }
        return getApi()
          .settings.load()
          .then((settings) => {
            const token = settings.host === 'ipme.integromat.com' ? settings.ipmeToken : settings.ipmToken
            if (!token?.trim()) {
              setForcedSettings(true)
              setShowSettings(true)
            } else {
              // Tokens exist and session is valid — enable menu items
              getApi().menu.setEnabled(true)
            }
          })
      })
      .catch((error: unknown) => {
        console.error('Failed to check the session', error)
        showToast('Could not check the session. Open Settings to verify your tokens.', 'error')
      })

    // Periodic session check (every 30 minutes)
    const sessionInterval = setInterval(
      async () => {
        try {
          const { expired } = await getApi().session.check()
          if (expired) {
            showToast('Session expired (48h inactive). Please re-enter your tokens.', 'error')
            getApi().menu.setEnabled(false)
            setForcedSettings(true)
            setShowSettings(true)
          }
        } catch (error) {
          console.error('Failed to check the session', error)
        }
      },
      30 * 60 * 1000
    )

    return () => {
      clearInterval(sessionInterval)
      cleanupSettings()
      cleanupDownload()
      cleanupInfo()
    }
  }, [])

  useEffect(() => {
    if (!showInfo) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') setShowInfo(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showInfo])

  const invalidateRequests = useCallback(() => {
    requestIdRef.current++
    setLoading(false)
  }, [])

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
    [invalidateRequests]
  )

  const handleSwap = useCallback(() => {
    invalidateRequests()
    setFromVersion(toVersion)
    setToVersion(fromVersion)
  }, [fromVersion, toVersion, invalidateRequests])

  const handleCompare = useCallback(
    async (decompileFlag?: boolean) => {
      if (!appInfo || !fromVersion || !toVersion) return

      const flag = typeof decompileFlag === 'boolean' ? decompileFlag : decompile
      const requestId = ++requestIdRef.current
      setViewMode('diff')
      setLoading(true)
      setError(null)
      setSelectedFile(null)

      try {
        const result = await getApi().ipm.getDiff(appInfo.name, fromVersion, toVersion, flag)
        if (requestId !== requestIdRef.current) return
        if (result.success && result.data) {
          setDiffResult(result.data)
        } else {
          setError(result.error || 'Compare failed')
        }
      } catch (err) {
        if (requestId !== requestIdRef.current) return
        const message = err instanceof Error ? err.message : String(err)
        setError(message)
      } finally {
        if (requestId === requestIdRef.current) setLoading(false)
      }
    },
    [appInfo, fromVersion, toVersion, decompile]
  )

  const handleShow = useCallback(
    async (version: string, decompileFlag?: boolean) => {
      if (!appInfo) return
      const flag = typeof decompileFlag === 'boolean' ? decompileFlag : decompile
      const requestId = ++requestIdRef.current
      setViewMode('show')
      setLoading(true)
      setError(null)
      setSelectedFile(null)
      try {
        const result = await getApi().ipm.showVersion(appInfo.name, version, flag)
        if (requestId !== requestIdRef.current) return
        if (result.success && result.data) {
          setDiffResult(result.data)
        } else {
          setError(result.error || 'Show failed')
        }
      } catch (err) {
        if (requestId !== requestIdRef.current) return
        const message = err instanceof Error ? err.message : String(err)
        setError(message)
      } finally {
        if (requestId === requestIdRef.current) setLoading(false)
      }
    },
    [appInfo, decompile]
  )

  const handleDecompileToggle = useCallback(() => {
    const newDecompile = !decompile
    setDecompile(newDecompile)
    if (toVersion) handleShow(toVersion, newDecompile)
  }, [decompile, toVersion, handleShow])

  const handleOpenVscode = useCallback(async () => {
    if (!appInfo || !diffResult || !toVersion) return
    const files = diffResult.diffs.flatMap((d) => (d.newContent ? [{ path: d.filePath, content: d.newContent }] : []))
    try {
      const result = await getApi().editor.openInVscode({
        appName: appInfo.name,
        version: toVersion,
        files
      })
      if (!result.success) {
        showToast(result.error || 'Failed to open VS Code', 'error')
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to open VS Code', 'error')
    }
  }, [appInfo, diffResult, toVersion])

  const currentDiffs = useMemo(() => {
    if (!diffResult) return []
    return filterDiffs(diffResult.diffs, activeTab)
  }, [diffResult, activeTab])

  const summaries = useMemo(() => {
    if (!diffResult) return { app: null, account: null, hook: null }
    return {
      app: countChanges(filterDiffs(diffResult.diffs, 'app')),
      account: countChanges(filterDiffs(diffResult.diffs, 'account')),
      hook: countChanges(filterDiffs(diffResult.diffs, 'hook'))
    }
  }, [diffResult])

  return (
    <div className={`app-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      {!sidebarCollapsed && (
        <Sidebar
          onAppSelect={handleAppSelect}
          onSettingsClick={() => setShowSettings(true)}
          appIcon={appIcon}
          appTheme={appInfo?.theme}
          refreshKey={appListRefreshKey}
        />
      )}

      <main className="main-content">
        <div className="main-top-bar">
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarCollapsed((p) => !p)}
            title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="1" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.2" />
              <line x1="5.5" y1="1" x2="5.5" y2="15" stroke="currentColor" strokeWidth="1.2" />
              {sidebarCollapsed ? (
                <path
                  d="M8.5 5.5L11 8L8.5 10.5"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : (
                <path
                  d="M11 5.5L8.5 8L11 10.5"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
            </svg>
          </button>
        </div>
        {!appInfo ? (
          <EmptyState />
        ) : (
          <>
            <div className="content-header">
              <div className="content-header-info">
                <div className="app-icon" style={{ background: appInfo.theme || 'var(--bg-surface)' }}>
                  {appIcon ? (
                    <img src={appIcon} alt={appInfo.label || appInfo.name} />
                  ) : (
                    <span className="app-icon-initial">{(appInfo.label || appInfo.name).charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div className="content-header-text">
                  <h2>{appInfo.label || appInfo.name}</h2>
                  <span className="content-header-meta">
                    {appInfo.name}
                    {appInfo.version && <span className="content-header-version">v{appInfo.version}</span>}
                  </span>
                  {appInfo.description && <p className="content-header-desc">{appInfo.description}</p>}
                </div>
              </div>
              <VersionSelector
                versions={appInfo.versions || []}
                appName={appInfo.name}
                fromVersion={fromVersion}
                toVersion={toVersion}
                onFromChange={handleFromChange}
                onToChange={handleToChange}
                onSwap={handleSwap}
                onCompare={handleCompare}
                onShow={handleShow}
                loading={loading}
                tags={appInfo.meta?.tag}
              />
            </div>

            {error && (
              <div className="error-message">
                <span className="error-message-text">{error}</span>
                <button
                  className="btn-retry"
                  onClick={() => {
                    if (viewMode === 'show' && toVersion) {
                      handleShow(toVersion)
                    } else {
                      handleCompare()
                    }
                  }}
                >
                  Retry
                </button>
              </div>
            )}

            {loading && (
              <div className="loading-state">
                <div className="spinner" />
                <p>Comparing versions...</p>
              </div>
            )}

            {!loading && !diffResult && !error && (
              <div className="empty-state">
                <p>Select two versions above and click Compare to see differences.</p>
                <p className="hint">Tip: Cmd+Enter to compare quickly</p>
              </div>
            )}

            {!loading && diffResult && (
              <>
                <ComponentTabs
                  activeTab={activeTab}
                  onTabChange={(tab) => {
                    setActiveTab(tab)
                    setSelectedFile(null)
                  }}
                  summaries={summaries}
                  isCustomApp={viewMode === 'show' ? diffResult?.isCustomApp : undefined}
                  decompile={decompile}
                  onDecompileToggle={handleDecompileToggle}
                  onOpenVscode={viewMode === 'show' ? handleOpenVscode : undefined}
                />

                <div className="diff-layout">
                  {currentDiffs.length > 0 ? (
                    <>
                      <FileTree
                        diffs={currentDiffs}
                        selectedFile={selectedFile}
                        onFileSelect={setSelectedFile}
                        appName={appInfo.name}
                        fromVersion={fromVersion}
                        toVersion={toVersion}
                        viewMode={viewMode}
                      />
                      <DiffViewer
                        diffs={currentDiffs}
                        selectedFile={selectedFile}
                        viewMode={viewMode}
                        fromVersion={fromVersion}
                        toVersion={toVersion}
                      />
                    </>
                  ) : (
                    <div className="diff-viewer-empty">
                      <p>No changes</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </main>

      <ToastContainer />

      {showSettings && (
        <Settings
          forced={forcedSettings}
          onSaved={() => setAppListRefreshKey((k) => k + 1)}
          onClose={() => {
            setShowSettings(false)
            setForcedSettings(false)
          }}
        />
      )}
      {showDownloadModal && <DownloadModal onClose={() => setShowDownloadModal(false)} />}
      {showInfo && <AboutModal onClose={() => setShowInfo(false)} />}
    </div>
  )
}
