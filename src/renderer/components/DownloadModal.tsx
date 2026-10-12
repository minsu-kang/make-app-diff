import React, { useState, useEffect, useMemo, useRef, useId, useCallback } from 'react'
import type { SearchApp, SearchEntry } from '../shared/types'
import { buildSearchEntries, entryLabel, getSearchInputValue, moveHighlight } from '../utils/app-search'
import { getApi } from '../shared/api/electron-api'

const MAX_RESULTS = 30

interface DownloadModalProps {
  onClose: () => void
}

function HighlightMatch({ text, query }: Readonly<{ text: string; query: string }>) {
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

export default function DownloadModal({ onClose }: Readonly<DownloadModalProps>) {
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
  const listboxId = useId()
  const optionId = useCallback((index: number) => `${listboxId}-option-${index}`, [listboxId])

  useEffect(() => {
    setHighlightedIndex(-1)
  }, [searchQuery])

  useEffect(() => {
    if (highlightedIndex >= 0) document.getElementById(optionId(highlightedIndex))?.scrollIntoView({ block: 'nearest' })
  }, [highlightedIndex, optionId])

  useEffect(() => {
    setLoadingApps(true)
    getApi()
      .ipm.searchApps()
      .then((result) => {
        if (result.success && result.data) {
          setAllApps(result.data)
        } else {
          setMessage(`Error: ${result.error || 'Failed to load apps'}`)
        }
      })
      .catch((err: unknown) => setMessage(`Error: ${err instanceof Error ? err.message : String(err)}`))
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

  const filteredEntries = useMemo(() => buildSearchEntries(allApps, searchQuery, MAX_RESULTS), [searchQuery, allApps])

  const showResults = searchQuery.trim() !== '' && filteredEntries.length > 0

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
      const result = await getApi().ipm.downloadVersion(selectedEntry.app.name, selectedVersion)
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
              <button className="btn-secondary" onClick={() => getApi().showInFinder(downloadedPath)}>
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
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={showResults}
                aria-controls={showResults ? listboxId : undefined}
                aria-activedescendant={
                  showResults && highlightedIndex >= 0 && highlightedIndex < filteredEntries.length
                    ? optionId(highlightedIndex)
                    : undefined
                }
                value={getSearchInputValue(selectedEntry, searchQuery)}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  if (selectedEntry) setSelectedEntry(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setHighlightedIndex((prev) => moveHighlight(prev, filteredEntries.length, 'down'))
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setHighlightedIndex((prev) => moveHighlight(prev, filteredEntries.length, 'up'))
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

            {showResults && (
              <ul id={listboxId} role="listbox" aria-label="Matching apps" className="download-search-results">
                {filteredEntries.map((entry, index) => (
                  <li
                    key={`${entry.app.name}-v${entry.major}`}
                    id={optionId(index)}
                    role="option"
                    aria-selected={index === highlightedIndex}
                    className={`search-result-item${index === highlightedIndex ? ' highlighted' : ''}`}
                    onClick={() => handleSelectEntry(entry)}
                  >
                    <span className="search-result-label">
                      <HighlightMatch text={entryLabel(entry)} query={searchQuery} />
                    </span>
                    <span className="search-result-name">
                      <HighlightMatch text={entry.app.name} query={searchQuery} /> · {entry.versions.length} versions
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {searchQuery.trim() && filteredEntries.length >= MAX_RESULTS && (
              <div className="search-no-results">Showing first {MAX_RESULTS} results — refine your search</div>
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
