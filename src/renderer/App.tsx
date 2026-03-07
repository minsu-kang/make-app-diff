import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import Sidebar from './components/Sidebar'
import Settings from './components/Settings'
import DownloadModal from './components/DownloadModal'
import VersionSelector from './components/VersionSelector'
import ComponentTabs from './components/ComponentTabs'
import FileTree from './components/FileTree'
import DiffViewer from './components/DiffViewer'
import ToastContainer from './components/Toast'

type TabType = 'app' | 'account' | 'hook'

interface AppInfo {
  name: string
  label: string
  description: string
  version: string
  versions: string[]
  theme?: string
  iconHash?: string
  [key: string]: unknown
}

interface FileDiff {
  filePath: string
  status: 'added' | 'deleted' | 'modified' | 'unchanged'
  oldContent: string
  newContent: string
  unifiedDiff: string
}

interface DiffResult {
  diffs: FileDiff[]
  summary: {
    added: number
    deleted: number
    modified: number
    unchanged: number
  }
}

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

  useEffect(() => {
    const w = window as any
    w.onMenu?.openSettings(() => setShowSettings(true))
    w.onMenu?.downloadApp(() => setShowDownloadModal(true))
    w.onMenu?.showInfo(() => setShowInfo(true))
    window.api.theme.load().then((theme) => {
      document.documentElement.setAttribute('data-theme', theme)
    })

    // Check if token is valid on startup
    window.api.settings.load().then((settings) => {
      const token = settings.host === 'ipme.integromat.com' ? settings.ipmeToken : settings.ipmToken
      if (!token || !token.trim()) {
        setForcedSettings(true)
        setShowSettings(true)
      }
    })
  }, [])

  const handleAppSelect = useCallback((info: AppInfo) => {
    setAppInfo(info)
    setDiffResult(null)
    setSelectedFile(null)
    setError(null)
    setAppIcon(null)

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

  const handleCompare = useCallback(async () => {
    if (!appInfo || !fromVersion || !toVersion) return

    setLoading(true)
    setError(null)
    setSelectedFile(null)

    try {
      const result = await window.api.ipm.getDiff(appInfo.name, fromVersion, toVersion)
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
  }, [appInfo, fromVersion, toVersion])

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
      {!sidebarCollapsed && <Sidebar onAppSelect={handleAppSelect} onSettingsClick={() => setShowSettings(true)} />}

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
          <div className="empty-state">
            <h2>MakeDiff</h2>
            <p>Search for an app in the sidebar to get started.</p>
            <p className="hint">Configure your IPM token in Settings first.</p>
          </div>
        ) : (
          <>
            <div className="content-header">
              <div className="content-header-info">
                <div className="app-icon" style={{ background: (appInfo.theme as string) || 'var(--bg-surface)' }}>
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
                loading={loading}
              />
            </div>

            {error && <div className="error-message">{error}</div>}

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
                      />
                      <DiffViewer diffs={currentDiffs} selectedFile={selectedFile} />
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
              <h3 className="info-app-title">MakeDiff</h3>
              <p className="info-app-desc">Make.com app version diff viewer</p>
              <div className="info-row">
                <span className="info-label">Version</span>
                <span className="info-value">1.0.0</span>
              </div>
              <div className="info-row">
                <span className="info-label">Electron</span>
                <span className="info-value info-mono">{(window as any).appVersion?.electron || '-'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Chrome</span>
                <span className="info-value info-mono">{(window as any).appVersion?.chrome || '-'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Node</span>
                <span className="info-value info-mono">{(window as any).appVersion?.node || '-'}</span>
              </div>
              <p className="info-copyright">&copy; {new Date().getFullYear()} Minsu Kang</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
