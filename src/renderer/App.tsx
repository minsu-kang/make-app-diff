import React, { useState, useCallback, useMemo, useEffect } from 'react'
import type { AppInfo, FileDiff, DiffResult } from '../preload/index'
import Sidebar from './components/Sidebar'
import Settings from './components/Settings'
import DownloadModal from './components/DownloadModal'
import VersionSelector from './components/VersionSelector'
import ComponentTabs from './components/ComponentTabs'
import FileTree from './components/FileTree'
import DiffViewer from './components/DiffViewer'
import ToastContainer, { showToast } from './components/Toast'

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
  const [updateVersion, setUpdateVersion] = useState<string | null>(null)

  useEffect(() => {
    const cleanupAvailable = window.api.update.onAvailable((version) => {
      setUpdateVersion(version)
    })
    const cleanupUpToDate = window.api.update.onUpToDate(() => {
      showToast('You are on the latest version', 'success')
    })
    const cleanupError = window.api.update.onError((message) => {
      showToast(message || 'Could not check for updates', 'error')
    })
    return () => {
      cleanupAvailable()
      cleanupUpToDate()
      cleanupError()
    }
  }, [])

  useEffect(() => {
    const cleanupSettings = window.onMenu.openSettings(() => setShowSettings(true))
    const cleanupDownload = window.onMenu.downloadApp(() => setShowDownloadModal(true))
    const cleanupInfo = window.onMenu.showInfo(() => setShowInfo(true))
    window.api.theme.load().then((theme) => {
      document.documentElement.setAttribute('data-theme', theme)
    })

    // Check session expiry, then check if token exists
    window.api.session.check().then(({ expired }) => {
      if (expired) {
        showToast('Session expired (48h inactive). Please re-enter your tokens.', 'error')
        setForcedSettings(true)
        setShowSettings(true)
        return
      }
      window.api.settings.load().then((settings) => {
        const token = settings.host === 'ipme.integromat.com' ? settings.ipmeToken : settings.ipmToken
        if (!token || !token.trim()) {
          setForcedSettings(true)
          setShowSettings(true)
        }
      })
    })

    // Periodic session check (every 30 minutes)
    const sessionInterval = setInterval(
      async () => {
        const { expired } = await window.api.session.check()
        if (expired) {
          showToast('Session expired (48h inactive). Please re-enter your tokens.', 'error')
          setForcedSettings(true)
          setShowSettings(true)
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

  const handleAppSelect = useCallback((info: AppInfo) => {
    setAppInfo(info)
    setDiffResult(null)
    setSelectedFile(null)
    setError(null)
    setAppIcon(null)
    setDecompile(true)

    // Fetch app icon from /admin/icon/apps/{appName}
    window.api.ipm
      .getAppIcon(info.name)
      .then((result) => {
        if (result.success && result.data) {
          setAppIcon(result.data)
        }
      })
      .catch(() => {})

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
  }, [])

  const handleSwap = useCallback(() => {
    setFromVersion(toVersion)
    setToVersion(fromVersion)
  }, [fromVersion, toVersion])

  const handleCompare = useCallback(
    async (decompileFlag?: boolean) => {
      if (!appInfo || !fromVersion || !toVersion) return

      const flag = typeof decompileFlag === 'boolean' ? decompileFlag : decompile
      setViewMode('diff')
      setLoading(true)
      setError(null)
      setSelectedFile(null)

      try {
        const result = await window.api.ipm.getDiff(appInfo.name, fromVersion, toVersion, flag)
        if (result.success && result.data) {
          setDiffResult(result.data)
        } else {
          setError(result.error || 'Compare failed')
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setError(message)
      } finally {
        setLoading(false)
      }
    },
    [appInfo, fromVersion, toVersion, decompile]
  )

  const handleShow = useCallback(
    async (version: string, decompileFlag?: boolean) => {
      if (!appInfo) return
      const flag = typeof decompileFlag === 'boolean' ? decompileFlag : decompile
      setViewMode('show')
      setLoading(true)
      setError(null)
      setSelectedFile(null)
      try {
        const result = await window.api.ipm.showVersion(appInfo.name, version, flag)
        if (result.success && result.data) {
          setDiffResult(result.data)
        } else {
          setError(result.error || 'Show failed')
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setError(message)
      } finally {
        setLoading(false)
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
    const files = diffResult.diffs
      .filter((d) => d.newContent)
      .map((d) => ({ path: d.filePath, content: d.newContent! }))
    const result = await window.api.editor.openInVscode({
      appName: appInfo.name,
      version: toVersion,
      files
    })
    if (!result.success) {
      showToast(result.error || 'Failed to open VS Code', 'error')
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
        />
      )}

      <main className="main-content">
        {updateVersion && (
          <div className="update-banner">
            <span>v{updateVersion} available</span>
            <button className="update-banner-btn" onClick={() => window.api.update.openRelease(updateVersion!)}>
              Download
            </button>
            {navigator.userAgent.includes('Mac') && (
              <button
                className="update-banner-btn update-banner-brew"
                onClick={() => {
                  navigator.clipboard.writeText(
                    'osascript -e \'quit app "MakeDiff"\' && brew update && brew upgrade --cask makediff && open -a MakeDiff'
                  )
                  showToast('Copied to clipboard', 'success')
                }}
              >
                brew upgrade
              </button>
            )}
            <button className="update-banner-dismiss" onClick={() => setUpdateVersion(null)}>
              &#10005;
            </button>
          </div>
        )}
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
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg width="80" height="80" viewBox="0 0 512 512" fill="none">
                <rect width="512" height="512" rx="108" fill="var(--accent-primary)" opacity="0.15" />
                <g transform="translate(80, 80)">
                  <rect x="0" y="20" width="200" height="260" rx="16" fill="currentColor" opacity="0.1" />
                  <rect x="24" y="52" width="120" height="8" rx="4" fill="currentColor" opacity="0.15" />
                  <rect x="24" y="72" width="152" height="8" rx="4" fill="currentColor" opacity="0.15" />
                  <rect x="24" y="92" width="100" height="8" rx="4" fill="currentColor" opacity="0.15" />
                  <rect x="24" y="122" width="140" height="8" rx="4" fill="#f85149" opacity="0.5" />
                  <rect x="24" y="142" width="110" height="8" rx="4" fill="#f85149" opacity="0.5" />
                  <rect x="24" y="172" width="130" height="8" rx="4" fill="currentColor" opacity="0.15" />
                  <rect x="24" y="192" width="90" height="8" rx="4" fill="currentColor" opacity="0.15" />
                </g>
                <g transform="translate(232, 152)">
                  <rect x="0" y="0" width="200" height="260" rx="16" fill="currentColor" opacity="0.15" />
                  <rect x="24" y="32" width="120" height="8" rx="4" fill="currentColor" opacity="0.15" />
                  <rect x="24" y="52" width="152" height="8" rx="4" fill="currentColor" opacity="0.15" />
                  <rect x="24" y="72" width="100" height="8" rx="4" fill="currentColor" opacity="0.15" />
                  <rect x="24" y="102" width="140" height="8" rx="4" fill="#2ea043" opacity="0.6" />
                  <rect x="24" y="122" width="125" height="8" rx="4" fill="#2ea043" opacity="0.6" />
                  <rect x="24" y="142" width="90" height="8" rx="4" fill="#2ea043" opacity="0.6" />
                  <rect x="24" y="172" width="130" height="8" rx="4" fill="currentColor" opacity="0.15" />
                  <rect x="24" y="192" width="90" height="8" rx="4" fill="currentColor" opacity="0.15" />
                </g>
                <g transform="translate(196, 210)">
                  <circle cx="0" cy="0" r="28" fill="var(--accent-primary)" opacity="0.8" />
                  <path d="M-10 -6 L4 -6 L4 -12 L14 0 L4 12 L4 6 L-10 6 Z" fill="var(--bg-primary)" />
                </g>
              </svg>
            </div>
            <h2>MakeDiff</h2>
            <p className="empty-state-subtitle">
              for
              <svg className="make-logo" viewBox="120 150 240 175" width="28" height="20">
                <defs>
                  <radialGradient
                    id="make-grad"
                    cx="-2611.69"
                    cy="9830.79"
                    fx="-2611.69"
                    fy="9830.79"
                    r="1.62"
                    gradientTransform="translate(397367.47 1495683.63) scale(152.03 -152.13)"
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop offset=".2" stopColor="#f024f6" />
                    <stop offset=".39" stopColor="#c416f8" />
                    <stop offset=".61" stopColor="#9406f9" />
                    <stop offset=".72" stopColor="#8200fa" />
                  </radialGradient>
                </defs>
                <path
                  fill="url(#make-grad)"
                  d="M216.46,298.9l31.79-132.55c.63-2.62,3.26-4.23,5.88-3.6l37.86,9.08c2.62.63,4.23,3.26,3.6,5.88l-31.79,132.55c-.63,2.62-3.26,4.23-5.88,3.6l-37.86-9.08c-2.61-.64-4.22-3.26-3.6-5.88ZM305.18,313.01h38.95c2.69,0,4.87-2.18,4.87-4.86h0v-136.31c0-2.69-2.18-4.87-4.86-4.87h-38.95c-2.69,0-4.87,2.18-4.87,4.86h0v136.31c0,2.69,2.18,4.87,4.86,4.87h0ZM136.39,293.6l35.01,17.08c2.41,1.18,5.32.17,6.5-2.24,0,0,0,0,0,0l59.78-122.5c1.18-2.41.17-5.32-2.24-6.5,0,0,0,0,0,0l-35.01-17.08c-2.41-1.18-5.32-.17-6.5,2.24,0,0,0,0,0,0l-59.76,122.48c-1.19,2.42-.19,5.33,2.23,6.52,0,0,0,0,0,0h0Z"
                />
              </svg>
              <span className="make-brand">make.com</span>
            </p>
            <p>Search for an app in the sidebar to get started.</p>
            <div className="empty-state-shortcuts">
              <div className="shortcut-item">
                <kbd>&#8984;</kbd>
                <kbd>,</kbd>
                <span>Settings</span>
              </div>
              <div className="shortcut-item">
                <kbd>&#8984;</kbd>
                <kbd>D</kbd>
                <span>Download</span>
              </div>
            </div>
          </div>
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
                onFromChange={setFromVersion}
                onToChange={setToVersion}
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
          onClose={() => {
            setShowSettings(false)
            setForcedSettings(false)
          }}
        />
      )}
      {showDownloadModal && <DownloadModal onClose={() => setShowDownloadModal(false)} />}
      {showInfo && (
        <div className="settings-overlay" onClick={() => setShowInfo(false)}>
          <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
            <div className="settings-header">
              <h2>About</h2>
              <button className="btn-icon" onClick={() => setShowInfo(false)}>
                &#10005;
              </button>
            </div>
            <div className="info-panel-body info-about">
              <svg className="info-make-logo" viewBox="0 0 1230.4 434.44" width="140" height="50">
                <defs>
                  <radialGradient
                    id="make-grad-about"
                    cx="-2611.69"
                    cy="9830.79"
                    fx="-2611.69"
                    fy="9830.79"
                    r="1.62"
                    gradientTransform="translate(397367.47 1495683.63) scale(152.03 -152.13)"
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop offset=".2" stopColor="#f024f6" />
                    <stop offset=".39" stopColor="#c416f8" />
                    <stop offset=".61" stopColor="#9406f9" />
                    <stop offset=".72" stopColor="#8200fa" />
                  </radialGradient>
                </defs>
                <path
                  fill="url(#make-grad-about)"
                  d="M216.46,298.9l31.79-132.55c.63-2.62,3.26-4.23,5.88-3.6l37.86,9.08c2.62.63,4.23,3.26,3.6,5.88l-31.79,132.55c-.63,2.62-3.26,4.23-5.88,3.6l-37.86-9.08c-2.61-.64-4.22-3.26-3.6-5.88ZM305.18,313.01h38.95c2.69,0,4.87-2.18,4.87-4.86h0v-136.31c0-2.69-2.18-4.87-4.86-4.87h-38.95c-2.69,0-4.87,2.18-4.87,4.86h0v136.31c0,2.69,2.18,4.87,4.86,4.87h0ZM136.39,293.6l35.01,17.08c2.41,1.18,5.32.17,6.5-2.24,0,0,0,0,0,0l59.78-122.5c1.18-2.41.17-5.32-2.24-6.5,0,0,0,0,0,0l-35.01-17.08c-2.41-1.18-5.32-.17-6.5,2.24,0,0,0,0,0,0l-59.76,122.48c-1.19,2.42-.19,5.33,2.23,6.52,0,0,0,0,0,0h0Z"
                />
                <path
                  fill="var(--text-primary)"
                  d="M464.66,221.49v86.43c0,2.8-2.26,5.08-5.06,5.08h-37.39c-2.81,0-5.08-2.28-5.08-5.08v-135.86c0-2.81,2.28-5.08,5.08-5.08h37.35c2.8,0,5.08,2.26,5.08,5.06h0v10.14c9.82-12.59,25.09-19.69,41.05-19.08,16.31-.64,31.84,6.97,41.33,20.25,11.56-13.46,28.63-20.92,46.36-20.25,32.86,0,55.46,19.36,55.46,56.33v88.5c0,2.8-2.26,5.08-5.06,5.08h-37.31c-2.81,0-5.08-2.28-5.08-5.08v-78.53c0-16.14-9.09-24.06-21.42-24.06-10.24.33-19.32,6.66-23.19,16.14v86.45c0,2.8-2.26,5.08-5.06,5.08h-37.39c-2.81,0-5.08-2.28-5.08-5.08v-78.53c0-16.14-9.09-24.06-21.42-24.06-10.26.26-19.37,6.61-23.16,16.15Z M712.38,315.95c-27.58,0-50.77-18.19-50.77-46.36,0-25.81,17.02-37.84,48.7-46.06l40.5-10.56c-1.17-9.69-8.81-14.38-21.12-14.38-10.88,0-18.77,4.18-22.4,12.53-.95,2.35-3.47,3.67-5.94,3.1l-32.1-7.61c-2.74-.66-4.43-3.41-3.78-6.16.05-.18.1-.36.17-.55,9.21-24.92,34.79-37.98,65.77-37.98,41.66,0,65.72,19.66,65.72,54.27v91.71c0,2.81-2.28,5.08-5.08,5.08h-35.38c-2.76,0-5.01-2.21-5.08-4.97l-.18-7.61-.3.3c-10.5,9.82-24.34,15.27-38.71,15.23ZM724.41,279.28c6.41-.17,12.62-2.21,17.89-5.86l8.22-4.98.3-23.77-21.12,5.86c-14.38,4.11-20.83,7.61-20.83,15.84,0,9.09,7.92,12.91,15.55,12.91h0Z M873.05,243.77l-14.38,13.2v50.93c0,2.8-2.26,5.08-5.06,5.08h-36.5c-2.81,0-5.08-2.28-5.08-5.08V123.28c0-2.81,2.28-5.08,5.08-5.08h36.49c2.81,0,5.08,2.28,5.08,5.08v83.53l42.55-39.15c.95-.86,2.19-1.34,3.47-1.34h45.03c2.81,0,5.08,2.28,5.08,5.08,0,1.43-.61,2.8-1.67,3.76l-43.72,39.84,49.83,90.44c1.36,2.45.47,5.54-1.98,6.9-.76.42-1.61.64-2.48.64h-42.57c-1.9,0-3.63-1.06-4.51-2.74l-34.68-66.48Z M1027.83,316.25c-40.78,0-78.05-25.52-78.05-77.21,0-48.7,35.8-76.86,75.11-76.86s70.42,28.45,71.6,73.34c.13,4.74.2,8.04.25,10.4.03,2.8-2.21,5.1-5.01,5.13,0,0,0,0,0,0h-94.98c1.47,17.61,15.55,28.75,33.46,28.75,11.96.28,23.32-5.26,30.45-14.87,1.62-2.11,4.61-2.59,6.82-1.09l23.72,15.88c2.34,1.6,2.96,4.79,1.37,7.15,0,.02-.02.02-.02.03-12.68,18.7-33.63,29.34-64.7,29.34ZM997.61,222.35h51.35c-.3-16.7-12.61-24.05-25.52-24.05-13.63-.62-25.18,9.92-25.8,23.55,0,0,0,.01,0,.02-.03.16-.04.32-.03.48Z"
                />
              </svg>
              <h3 className="info-app-title">MakeDiff</h3>
              <p className="info-app-desc">App version diff viewer</p>
              <div className="info-row">
                <span className="info-label">Version</span>
                <span className="info-value">{window.appVersion?.app || '1.0.0'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Electron</span>
                <span className="info-value info-mono">{window.appVersion?.electron || '-'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Chrome</span>
                <span className="info-value info-mono">{window.appVersion?.chrome || '-'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Node</span>
                <span className="info-value info-mono">{window.appVersion?.node || '-'}</span>
              </div>
              <p className="info-copyright">&copy; {new Date().getFullYear()} Minsu Kang</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
