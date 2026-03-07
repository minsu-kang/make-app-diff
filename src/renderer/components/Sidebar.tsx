import React, { useState, useEffect, useMemo } from 'react'

interface SearchApp {
  name: string
  label: string
  version: string
  availableVersions: string[]
}

interface SearchEntry {
  app: SearchApp
  major: number
  versions: string[]
}

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

interface SidebarProps {
  onAppSelect: (info: AppInfo) => void
  onSettingsClick: () => void
}

function getMajor(version: string): number {
  return parseInt(version.split('.')[0], 10) || 0
}

export default function Sidebar({ onAppSelect, onSettingsClick }: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [allApps, setAllApps] = useState<SearchApp[]>([])
  const [loadingApps, setLoadingApps] = useState(false)
  const [selectedApp, setSelectedApp] = useState<AppInfo | null>(null)
  const [loadingInfo, setLoadingInfo] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

    return entries.slice(0, 50)
  }, [searchQuery, allApps])

  const handleSelect = async (entry: SearchEntry) => {
    setSearchQuery('')
    setLoadingInfo(true)
    setError(null)
    try {
      const result = await window.api.ipm.getAppInfo(entry.app.name)
      if (result.success && result.data) {
        const info = {
          ...result.data,
          versions: entry.versions,
          version: entry.versions[0]
        }
        setSelectedApp(info)
        onAppSelect(info)
      } else {
        setError(result.error || 'Failed to load app info')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoadingInfo(false)
    }
  }

  return (
    <div className="sidebar">
      <div className="sidebar-drag-region" />

      <div className="sidebar-top">
        <div className="sidebar-title-row">
          <span className="app-logo">
            <svg width="22" height="22" viewBox="0 0 512 512" fill="none">
              <rect width="512" height="512" rx="108" fill="var(--logo-bg, #6C3FB5)" />
              <g transform="translate(80, 80)">
                <rect x="0" y="20" width="200" height="260" rx="16" fill="#fff" opacity="0.2" />
                <rect x="24" y="122" width="140" height="8" rx="4" fill="#f85149" opacity="0.8" />
                <rect x="24" y="142" width="110" height="8" rx="4" fill="#f85149" opacity="0.8" />
              </g>
              <g transform="translate(232, 152)">
                <rect x="0" y="0" width="200" height="260" rx="16" fill="#fff" opacity="0.92" />
                <rect x="24" y="102" width="140" height="8" rx="4" fill="#2ea043" opacity="0.85" />
                <rect x="24" y="122" width="125" height="8" rx="4" fill="#2ea043" opacity="0.85" />
                <rect x="24" y="142" width="90" height="8" rx="4" fill="#2ea043" opacity="0.85" />
              </g>
              <g transform="translate(196, 210)">
                <circle cx="0" cy="0" r="28" fill="#fff" opacity="0.95" />
                <path d="M-10 -6 L4 -6 L4 -12 L14 0 L4 12 L4 6 L-10 6 Z" fill="var(--logo-bg, #6C3FB5)" />
              </g>
            </svg>
          </span>
          <h1 className="app-title">MakeDiff</h1>
          <button className="btn-icon settings-btn" onClick={onSettingsClick} title="Settings">
            &#9881;
          </button>
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={loadingApps ? 'Loading apps...' : 'Search by label or name...'}
          className="search-input"
          disabled={loadingApps}
        />
      </div>

      {error && <div className="error-message">{error}</div>}

      {searchQuery.trim() && filteredEntries.length > 0 && (
        <ul className="search-results">
          {filteredEntries.map((entry) => {
            const hasMajors = allApps
              .find((a) => a.name === entry.app.name)!
              .availableVersions.some((v) => getMajor(v) !== entry.major)
            return (
              <li
                key={`${entry.app.name}-v${entry.major}`}
                className="search-result-item"
                onClick={() => handleSelect(entry)}
              >
                <span className="search-result-label">
                  {entry.app.label}
                  {hasMajors ? ` (v${entry.major})` : ''}
                </span>
                <span className="search-result-name">
                  {entry.app.name} · {entry.versions.length} versions
                </span>
              </li>
            )
          })}
        </ul>
      )}

      {searchQuery.trim() && filteredEntries.length === 0 && !loadingApps && (
        <div className="search-no-results">No apps found</div>
      )}

      {loadingInfo && <div className="search-no-results">Loading...</div>}

      {selectedApp && !searchQuery.trim() && (
        <div className="app-info-card">
          <h3>{selectedApp.label || selectedApp.name}</h3>
          <p className="app-name">{selectedApp.name}</p>
          <p className="app-version">Latest: v{selectedApp.version}</p>
          <p className="version-count">{selectedApp.versions?.length || 0} versions available</p>
        </div>
      )}

      {!selectedApp && !searchQuery.trim() && !loadingApps && allApps.length > 0 && (
        <div className="sidebar-hint">
          <p>Type to search from {allApps.length} apps</p>
        </div>
      )}
    </div>
  )
}
