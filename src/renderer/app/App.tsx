import Sidebar from '../features/sidebar/Sidebar'
import Settings from '../features/settings/Settings'
import DownloadModal from '../features/download/DownloadModal'
import VersionSelector from '../features/version-selector/VersionSelector'
import ComponentTabs from '../features/diff/ComponentTabs'
import FileTree from '../features/diff/FileTree'
import DiffViewer from '../features/diff/DiffViewer'
import ToastContainer from '../shared/ui/Toast'
import EmptyState from './EmptyState'
import AboutModal from './AboutModal'
import { useShellUi } from './hooks/use-shell-ui'
import { useMenuEvents } from './hooks/use-menu-events'
import { useSession } from './hooks/use-session'
import { useDiffState } from './hooks/use-diff-state'
import { useDiffRequest } from './hooks/use-diff-request'
import { useAppSelection } from './hooks/use-app-selection'
import './App.css'

export default function App() {
  const {
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
  } = useShellUi()
  useMenuEvents({ setShowSettings, setShowDownloadModal, setShowInfo })
  useSession({ setForcedSettings, setShowSettings })
  const {
    diffResult,
    setDiffResult,
    activeTab,
    setActiveTab,
    loading,
    setLoading,
    error,
    setError,
    selectedFile,
    setSelectedFile,
    viewMode,
    setViewMode,
    decompile,
    setDecompile,
    requestIdRef,
    invalidateRequests,
    currentDiffs,
    summaries
  } = useDiffState()
  const { appInfo, fromVersion, toVersion, appIcon, handleFromChange, handleToChange, handleAppSelect, handleSwap } =
    useAppSelection({ invalidateRequests, setDiffResult, setSelectedFile, setError, setDecompile })
  const { handleCompare, handleShow, handleDecompileToggle, handleOpenVscode } = useDiffRequest({
    appInfo,
    fromVersion,
    toVersion,
    diffResult,
    decompile,
    requestIdRef,
    setViewMode,
    setLoading,
    setError,
    setSelectedFile,
    setDiffResult,
    setDecompile
  })

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
