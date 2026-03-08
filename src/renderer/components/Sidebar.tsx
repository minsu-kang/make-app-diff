import React, { useState, useEffect, useMemo, useRef } from 'react'
import type { AppInfo, SearchApp, SearchEntry, FavoriteApp, RecentApp } from '../../preload/index'
import { getMajor } from '../utils/version'

interface SidebarProps {
  onAppSelect: (info: AppInfo) => void
  onSettingsClick: () => void
  appIcon?: string | null
  appTheme?: string | null
}

export default function Sidebar({ onAppSelect, onSettingsClick, appIcon, appTheme }: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [allApps, setAllApps] = useState<SearchApp[]>([])
  const [loadingApps, setLoadingApps] = useState(false)
  const [selectedApp, setSelectedApp] = useState<AppInfo | null>(null)
  const [loadingInfo, setLoadingInfo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [favorites, setFavorites] = useState<FavoriteApp[]>([])
  const [recentApps, setRecentApps] = useState<RecentApp[]>([])
  const [favoritesCollapsed, setFavoritesCollapsed] = useState(false)
  const [recentsCollapsed, setRecentsCollapsed] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Cmd+K global shortcut to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    window.api.favorites.load().then((r) => {
      if (r.success && r.data) setFavorites(r.data)
    })
    window.api.recent.load().then((r) => {
      if (r.success && r.data) setRecentApps(r.data)
    })
  }, [])

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

  // Reset highlighted index when search query changes
  useEffect(() => {
    setHighlightedIndex(-1)
  }, [searchQuery])

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
        // Add to recents
        window.api.recent.add(entry.app.name, entry.app.label).then((r) => {
          if (r.success && r.data) setRecentApps(r.data)
        })
      } else {
        setError(result.error || 'Failed to load app info')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoadingInfo(false)
    }
  }

  const handleQuickSelect = async (name: string, label: string) => {
    setLoadingInfo(true)
    setError(null)
    try {
      const result = await window.api.ipm.getAppInfo(name)
      if (result.success && result.data) {
        const app = allApps.find((a) => a.name === name)
        const versions = app ? app.availableVersions : result.data.versions
        const info = { ...result.data, versions, version: versions[0] }
        setSelectedApp(info)
        onAppSelect(info)
        window.api.recent.add(name, label).then((r) => {
          if (r.success && r.data) setRecentApps(r.data)
        })
      } else {
        setError(result.error || 'Failed to load app info')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoadingInfo(false)
    }
  }

  const toggleFavorite = (name: string, label: string) => {
    const exists = favorites.some((f) => f.name === name)
    const updated = exists
      ? favorites.filter((f) => f.name !== name)
      : [...favorites, { name, label, addedAt: Date.now() }]
    setFavorites(updated)
    window.api.favorites.save(updated)
  }

  const isFavorite = (name: string) => favorites.some((f) => f.name === name)

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
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setHighlightedIndex((prev) => (filteredEntries.length === 0 ? -1 : (prev + 1) % filteredEntries.length))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setHighlightedIndex((prev) =>
                filteredEntries.length === 0 ? -1 : prev <= 0 ? filteredEntries.length - 1 : prev - 1
              )
            } else if (e.key === 'Enter' && highlightedIndex >= 0 && highlightedIndex < filteredEntries.length) {
              e.preventDefault()
              handleSelect(filteredEntries[highlightedIndex])
            } else if (e.key === 'Escape') {
              setSearchQuery('')
              searchInputRef.current?.blur()
            }
          }}
          placeholder={loadingApps ? 'Loading apps...' : 'Search by label or name...'}
          className="search-input"
          disabled={loadingApps}
        />
      </div>

      {error && <div className="error-message">{error}</div>}

      {searchQuery.trim() && filteredEntries.length > 0 && (
        <ul className="search-results">
          {filteredEntries.map((entry, idx) => {
            const matchedApp = allApps.find((a) => a.name === entry.app.name)
            const hasMajors = matchedApp ? matchedApp.availableVersions.some((v) => getMajor(v) !== entry.major) : false
            return (
              <li
                key={`${entry.app.name}-v${entry.major}`}
                className={`search-result-item ${highlightedIndex === idx ? 'highlighted' : ''}`}
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

      {!searchQuery.trim() && (favorites.length > 0 || recentApps.length > 0) && (
        <div className="sidebar-sections">
          {favorites.length > 0 && (
            <div className="sidebar-section">
              <button className="sidebar-section-header" onClick={() => setFavoritesCollapsed(!favoritesCollapsed)}>
                <span className="sidebar-section-chevron" data-collapsed={favoritesCollapsed} />
                <span className="sidebar-section-icon">&#9733;</span>
                <span>Favorites</span>
                <span className="sidebar-section-count">{favorites.length}</span>
              </button>
              {!favoritesCollapsed && (
                <ul className="sidebar-section-list">
                  {favorites.map((fav) => (
                    <li
                      key={fav.name}
                      className={`sidebar-app-item ${selectedApp?.name === fav.name ? 'active' : ''}`}
                      onClick={() => handleQuickSelect(fav.name, fav.label)}
                    >
                      <span className="sidebar-app-item-label">{fav.label}</span>
                      <span className="sidebar-app-item-name">{fav.name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {recentApps.length > 0 && (
            <div className="sidebar-section">
              <button className="sidebar-section-header" onClick={() => setRecentsCollapsed(!recentsCollapsed)}>
                <span className="sidebar-section-chevron" data-collapsed={recentsCollapsed} />
                <span className="sidebar-section-icon">&#9719;</span>
                <span>Recents</span>
                <span className="sidebar-section-count">{recentApps.length}</span>
              </button>
              {!recentsCollapsed && (
                <ul className="sidebar-section-list">
                  {recentApps.map((app) => (
                    <li
                      key={app.name}
                      className={`sidebar-app-item ${selectedApp?.name === app.name ? 'active' : ''}`}
                      onClick={() => handleQuickSelect(app.name, app.label)}
                    >
                      <span className="sidebar-app-item-label">{app.label}</span>
                      <span className="sidebar-app-item-name">{app.name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {selectedApp && !searchQuery.trim() && (
        <div className="app-info-card">
          <div className="app-info-card-header">
            <div className="app-info-card-icon" style={{ background: appTheme || 'var(--bg-surface)' }}>
              {appIcon ? (
                <img src={appIcon} alt={selectedApp.label || selectedApp.name} />
              ) : (
                <span className="app-info-card-icon-initial">
                  {(selectedApp.label || selectedApp.name).charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <h3>{selectedApp.label || selectedApp.name}</h3>
            <button
              className={`btn-favorite ${isFavorite(selectedApp.name) ? 'active' : ''}`}
              onClick={() => toggleFavorite(selectedApp.name, selectedApp.label || selectedApp.name)}
              title={isFavorite(selectedApp.name) ? 'Remove from favorites' : 'Add to favorites'}
            >
              {isFavorite(selectedApp.name) ? '\u2605' : '\u2606'}
            </button>
          </div>
          <p className="app-name">{selectedApp.name}</p>
          <p className="app-version">Latest: v{selectedApp.version}</p>
          <p className="version-count">{selectedApp.versions?.length || 0} versions available</p>
        </div>
      )}

      {!selectedApp &&
        !searchQuery.trim() &&
        !loadingApps &&
        allApps.length > 0 &&
        favorites.length === 0 &&
        recentApps.length === 0 && (
          <div className="sidebar-hint">
            <p>Type to search from {allApps.length} apps</p>
          </div>
        )}
    </div>
  )
}
