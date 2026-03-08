import React, { useState, useEffect, useMemo } from 'react'
import type { VersionTags } from '../../preload/index'
import { showToast } from './Toast'
import VersionTimeline from './VersionTimeline'

interface VersionSelectorProps {
  versions: string[]
  appName: string
  fromVersion: string
  toVersion: string
  onFromChange: (version: string) => void
  onToChange: (version: string) => void
  onSwap: () => void
  onCompare: () => void
  onShow: (version: string) => void
  loading: boolean
  tags?: VersionTags
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
  onShow,
  loading,
  tags
}: VersionSelectorProps) {
  const [showDownload, setShowDownload] = useState(false)
  const [showTimeline, setShowTimeline] = useState(false)
  const [downloadVersion, setDownloadVersion] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [downloadedPath, setDownloadedPath] = useState<string | null>(null)
  const [copyingZip, setCopyingZip] = useState(false)

  const canCompare = fromVersion && toVersion && fromVersion !== toVersion && !loading

  // Filter versions to active major version only
  const filteredVersions = useMemo(() => {
    if (versions.length === 0) return versions
    const ref = toVersion || fromVersion
    let activeMajor: number
    if (ref) {
      activeMajor = parseInt(ref.split('.')[0], 10)
    } else {
      // Default to the latest version's major
      const sorted = [...versions].sort((a, b) => {
        const pa = a.split('.').map(Number)
        const pb = b.split('.').map(Number)
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
          if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0)
        }
        return 0
      })
      activeMajor = parseInt(sorted[sorted.length - 1].split('.')[0], 10)
    }
    return versions.filter((v) => parseInt(v.split('.')[0], 10) === activeMajor)
  }, [versions, fromVersion, toVersion])

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
        setDownloadedPath(result.data ?? null)
      } else if (result.error !== 'Cancelled') {
        showToast(`Download failed: ${result.error}`, 'error')
      }
    } catch (err) {
      showToast(`Download failed: ${err instanceof Error ? err.message : err}`, 'error')
    } finally {
      setDownloading(false)
    }
  }

  const handleCopyZip = async () => {
    if (!downloadVersion || !appName) return
    setCopyingZip(true)
    try {
      // Download and extract version files
      const result = await window.api.ipm.showVersion(appName, downloadVersion)
      if (!result.success || !result.data) {
        showToast(`Failed: ${result.error}`, 'error')
        return
      }
      const files = result.data.diffs.map((d) => ({
        path: d.filePath,
        content: d.newContent || d.oldContent
      }))
      const zipResult = await window.api.clipboard.copyZip({
        appName,
        version: downloadVersion,
        files
      })
      if (zipResult.success) {
        showToast('Copied! Cmd+V to paste', 'success')
      } else {
        showToast(`Failed: ${zipResult.error}`, 'error')
      }
    } catch (err) {
      showToast(`Failed: ${err instanceof Error ? err.message : err}`, 'error')
    } finally {
      setCopyingZip(false)
    }
  }

  const fromVersions = filteredVersions.filter((v) => v !== toVersion)
  const toVersions = filteredVersions.filter((v) => v !== fromVersion)

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

          {filteredVersions.length > 2 && (
            <button
              className={`btn-icon btn-timeline-toggle ${showTimeline ? 'active' : ''}`}
              onClick={() => setShowTimeline(!showTimeline)}
              title="Version timeline"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="4" cy="8" r="2" fill="currentColor" />
                <circle cx="8" cy="8" r="2" fill="currentColor" />
                <circle cx="12" cy="8" r="2" fill="currentColor" />
              </svg>
            </button>
          )}
        </div>

        {showDownload && (
          <div className="version-dropdowns download-row">
            <label className="version-label">
              <span>Download</span>
              <select value={downloadVersion} onChange={(e) => setDownloadVersion(e.target.value)}>
                <option value="">Select version...</option>
                {filteredVersions.map((v) => (
                  <option key={`dl-${v}`} value={v}>
                    v{v}
                  </option>
                ))}
              </select>
            </label>

            <button
              className="btn-secondary btn-download"
              onClick={() => downloadVersion && onShow(downloadVersion)}
              disabled={!downloadVersion || loading}
            >
              Show
            </button>

            <button
              className="btn-secondary btn-download"
              onClick={handleCopyZip}
              disabled={!downloadVersion || copyingZip || loading}
              title="Copy version as ZIP to clipboard (Cmd+V to paste)"
            >
              {copyingZip ? 'Copying...' : 'Copy ZIP'}
            </button>

            <button
              className="btn-primary btn-download"
              onClick={handleDownload}
              disabled={!downloadVersion || downloading}
            >
              {downloading ? 'Downloading...' : 'Download'}
            </button>
          </div>
        )}
        {showTimeline && filteredVersions.length > 2 && (
          <VersionTimeline
            versions={filteredVersions}
            fromVersion={fromVersion}
            toVersion={toVersion}
            tags={tags}
            onFromChange={onFromChange}
            onToChange={onToChange}
          />
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
