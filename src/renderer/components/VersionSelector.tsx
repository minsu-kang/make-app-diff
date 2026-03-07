import React, { useState, useEffect } from 'react'
import { showToast } from './Toast'

interface VersionSelectorProps {
  versions: string[]
  appName: string
  fromVersion: string
  toVersion: string
  onFromChange: (version: string) => void
  onToChange: (version: string) => void
  onSwap: () => void
  onCompare: () => void
  loading: boolean
}

export default function VersionSelector({
  versions,
  appName,
  fromVersion,
  toVersion,
  onFromChange,
  onToChange,
  onSwap,
  onCompare,
  loading
}: VersionSelectorProps) {
  const [showDownload, setShowDownload] = useState(false)
  const [downloadVersion, setDownloadVersion] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [downloadedPath, setDownloadedPath] = useState<string | null>(null)

  const canCompare = fromVersion && toVersion && fromVersion !== toVersion && !loading

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canCompare) {
        e.preventDefault()
        onCompare()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [canCompare, onCompare])

  const handleDownload = async () => {
    if (!downloadVersion || !appName) return
    setDownloading(true)
    try {
      const result = await window.api.ipm.downloadVersion(appName, downloadVersion)
      if (result.success) {
        setDownloadedPath(result.data!)
      } else if (result.error !== 'Cancelled') {
        showToast(`Download failed: ${result.error}`, 'error')
      }
    } catch (err) {
      showToast(`Download failed: ${err instanceof Error ? err.message : err}`, 'error')
    } finally {
      setDownloading(false)
    }
  }

  const fromVersions = versions.filter((v) => v !== toVersion)
  const toVersions = versions.filter((v) => v !== fromVersion)

  return (
    <>
      <div className="version-selector">
        <div className="version-dropdowns">
          <label className="version-label">
            <span>From</span>
            <select value={fromVersion} onChange={(e) => onFromChange(e.target.value)}>
              <option value="">Select version...</option>
              {fromVersions.map((v) => (
                <option key={`from-${v}`} value={v}>
                  v{v}
                </option>
              ))}
            </select>
          </label>

          <button
            className="btn-icon btn-swap"
            onClick={onSwap}
            title="Swap versions"
            disabled={!fromVersion && !toVersion}
          >
            &#8644;
          </button>

          <label className="version-label">
            <span>To</span>
            <select value={toVersion} onChange={(e) => onToChange(e.target.value)}>
              <option value="">Select version...</option>
              {toVersions.map((v) => (
                <option key={`to-${v}`} value={v}>
                  v{v}
                </option>
              ))}
            </select>
          </label>

          <button
            className="btn-primary btn-compare"
            onClick={onCompare}
            disabled={!canCompare}
            title="Compare versions (Cmd+Enter)"
          >
            {loading ? 'Comparing...' : 'Compare'}
          </button>

          <button
            className={`btn-icon btn-download-toggle ${showDownload ? 'active' : ''}`}
            onClick={() => setShowDownload(!showDownload)}
            title="Download version"
          >
            &#8615;
          </button>
        </div>

        {showDownload && (
          <div className="version-dropdowns download-row">
            <label className="version-label">
              <span>Download</span>
              <select value={downloadVersion} onChange={(e) => setDownloadVersion(e.target.value)}>
                <option value="">Select version...</option>
                {versions.map((v) => (
                  <option key={`dl-${v}`} value={v}>
                    v{v}
                  </option>
                ))}
              </select>
            </label>

            <button
              className="btn-primary btn-download"
              onClick={handleDownload}
              disabled={!downloadVersion || downloading}
            >
              {downloading ? 'Downloading...' : 'Download'}
            </button>
          </div>
        )}
      </div>

      {downloadedPath && (
        <div className="settings-overlay">
          <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
            <div className="download-success">
              <div className="download-success-icon">&#10003;</div>
              <p className="download-success-title">Download Complete</p>
              <p className="download-success-folder">{downloadedPath.split('/').pop()}</p>
              <p className="download-success-path">{downloadedPath.substring(0, downloadedPath.lastIndexOf('/'))}</p>
              <div className="download-success-actions">
                <button className="btn-secondary" onClick={() => window.api.showInFinder(downloadedPath)}>
                  Show in Finder
                </button>
                <button className="btn-primary" onClick={() => setDownloadedPath(null)}>
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
