import React, { useState, useEffect, useMemo, useRef } from 'react'
import type { SearchApp, SearchEntry } from '../../preload/index'
import { getMajor } from '../utils/version'

interface DownloadModalProps {
  onClose: () => void
}

function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark>{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  )
}

export default function DownloadModal({ onClose }: DownloadModalProps) {
  const [allApps, setAllApps] = useState<SearchApp[]>([])
  const [loadingApps, setLoadingApps] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedEntry, setSelectedEntry] = useState<SearchEntry | null>(null)
  const [selectedVersion, setSelectedVersion] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [downloadedPath, setDownloadedPath] = useState<string | null>(null)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setHighlightedIndex(-1)
  }, [searchQuery])

  useEffect(() => {
    setLoadingApps(true)
    window.api.ipm
      .searchApps()
      .then((result) => {
        if (result.success && result.data) {
          setAllApps(result.data)
        }
      })
      .finally(() => setLoadingApps(false))
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'Enter') {
        if (downloadedPath) {
          onClose()
        } else if (selectedEntry && selectedVersion && !downloading && document.activeElement?.tagName !== 'SELECT') {
          handleDownload()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [downloadedPath, selectedEntry, selectedVersion, downloading, onClose])

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return []

    const matched = allApps.filter((app) => app.label.toLowerCase().includes(q) || app.name.toLowerCase().includes(q))

    const entries: SearchEntry[] = []
    for (const app of matched) {
      const majorGroups = new Map<number, string[]>()
      for (const v of app.availableVersions) {
        const major = getMajor(v)
        if (!majorGroups.has(major)) majorGroups.set(major, [])
        majorGroups.get(major)!.push(v)
      }

      if (majorGroups.size <= 1) {
        entries.push({ app, major: getMajor(app.version), versions: app.availableVersions })
      } else {
        const sortedMajors = [...majorGroups.keys()].sort((a, b) => b - a)
        for (const major of sortedMajors) {
          entries.push({ app, major, versions: majorGroups.get(major)! })
        }
      }
    }

    return entries.slice(0, 30)
  }, [searchQuery, allApps])

  const handleSelectEntry = (entry: SearchEntry) => {
    setSelectedEntry(entry)
    setSearchQuery('')
    setSelectedVersion('')
    setMessage(null)
  }

  const handleDownload = async () => {
    if (!selectedEntry || !selectedVersion) return
    setDownloading(true)
    setMessage(null)
    try {
      const result = await window.api.ipm.downloadVersion(selectedEntry.app.name, selectedVersion)
      if (result.success) {
        setDownloadedPath(result.data ?? null)
      } else if (result.error !== 'Cancelled') {
        setMessage(`Error: ${result.error}`)
      }
    } catch (err) {
      setMessage(`Error: ${err instanceof Error ? err.message : err}`)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Download App</h2>
          <button className="btn-icon" onClick={onClose}>
            &times;
          </button>
        </div>

        {downloadedPath ? (
          <div className="download-success">
            <div className="download-success-icon">&#10003;</div>
            <p className="download-success-title">Download Complete</p>
            <p className="download-success-folder">{downloadedPath.split('/').pop()}</p>
            <p className="download-success-path">{downloadedPath.substring(0, downloadedPath.lastIndexOf('/'))}</p>
            <div className="download-success-actions">
              <button className="btn-secondary" onClick={() => window.api.showInFinder(downloadedPath)}>
                Show in Finder
              </button>
              <button className="btn-primary" onClick={onClose}>
                OK
              </button>
            </div>
          </div>
        ) : (
          <div className="settings-form">
            <label>
              <span>Search App</span>
              <input
                ref={searchInputRef}
                autoFocus
                type="text"
                value={
                  selectedEntry && !searchQuery
                    ? `${selectedEntry.app.label}${allApps.find((a) => a.name === selectedEntry.app.name)?.availableVersions.some((v) => getMajor(v) !== selectedEntry.major) ? ` (v${selectedEntry.major})` : ''}`
                    : searchQuery
                }
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  if (selectedEntry) setSelectedEntry(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setHighlightedIndex((prev) =>
                      filteredEntries.length === 0 ? -1 : (prev + 1) % filteredEntries.length
                    )
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setHighlightedIndex((prev) =>
                      filteredEntries.length === 0 ? -1 : prev <= 0 ? filteredEntries.length - 1 : prev - 1
                    )
                  } else if (e.key === 'Enter' && highlightedIndex >= 0 && highlightedIndex < filteredEntries.length) {
                    e.preventDefault()
                    e.stopPropagation()
                    handleSelectEntry(filteredEntries[highlightedIndex])
                  }
                }}
                placeholder={loadingApps ? 'Loading apps...' : 'Search by label or name...'}
                disabled={loadingApps}
              />
            </label>

            {searchQuery.trim() && filteredEntries.length > 0 && (
              <ul className="download-search-results">
                {filteredEntries.map((entry, index) => {
                  const hasMajors = entry.app.availableVersions.some((v) => getMajor(v) !== entry.major)
                  return (
                    <li
                      key={`${entry.app.name}-v${entry.major}`}
                      className={`search-result-item${index === highlightedIndex ? ' highlighted' : ''}`}
                      onClick={() => handleSelectEntry(entry)}
                    >
                      <span className="search-result-label">
                        <HighlightMatch
                          text={`${entry.app.label}${hasMajors ? ` (v${entry.major})` : ''}`}
                          query={searchQuery}
                        />
                      </span>
                      <span className="search-result-name">
                        <HighlightMatch text={entry.app.name} query={searchQuery} /> · {entry.versions.length} versions
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}

            {searchQuery.trim() && filteredEntries.length >= 30 && (
              <div className="search-no-results">Showing first 30 results — refine your search</div>
            )}

            {searchQuery.trim() && filteredEntries.length === 0 && !loadingApps && (
              <div className="search-no-results">No apps found</div>
            )}

            {selectedEntry && (
              <label>
                <span>Version</span>
                <select value={selectedVersion} onChange={(e) => setSelectedVersion(e.target.value)}>
                  <option value="">Select version...</option>
                  {selectedEntry.versions.map((v) => (
                    <option key={v} value={v}>
                      v{v}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {message && message.startsWith('Error') && <div className="error-message">{message}</div>}

            <button
              className="btn-primary"
              onClick={handleDownload}
              disabled={!selectedEntry || !selectedVersion || downloading}
            >
              {downloading ? 'Downloading...' : 'Download'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
