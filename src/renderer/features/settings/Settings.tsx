import React, { useState, useEffect, useRef } from 'react'
import type { IpmSettings } from '../../shared/types'
import { showToast } from '../../shared/ui/Toast'
import TokenField from './TokenField'
import { getApi } from '../../shared/api/electron-api'
import './Settings.css'

interface SettingsProps {
  onClose: () => void
  onSaved?: () => void
  forced?: boolean
}

const themeOptions = [
  { value: 'dark', label: 'Dark', bg: '#1e1e2e', accent: '#89b4fa' },
  { value: 'make', label: 'Make', bg: '#1a0a2e', accent: '#c85aff' },
  { value: 'light', label: 'Light', bg: '#ffffff', accent: '#0071e3' }
]

export default function Settings({ onClose, onSaved, forced }: Readonly<SettingsProps>) {
  const [settings, setSettings] = useState<IpmSettings>({
    host: 'ipme.integromat.com',
    ipmToken: '',
    ipmeToken: '',
    env: 'staging',
    ipmVersion: '3.20.0'
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showIpmToken, setShowIpmToken] = useState(false)
  const [showIpmeToken, setShowIpmeToken] = useState(false)
  const [theme, setTheme] = useState<string>('dark')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [showDiscardWarning, setShowDiscardWarning] = useState(false)

  const initialSettings = useRef<IpmSettings | null>(null)
  const initialTheme = useRef<string>('')

  useEffect(() => {
    Promise.all([getApi().settings.load(), getApi().theme.load()])
      .then(([loadedSettings, loadedTheme]) => {
        setSettings(loadedSettings)
        setTheme(loadedTheme)
        initialSettings.current = { ...loadedSettings }
        initialTheme.current = loadedTheme
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
  }, [])

  const isDirty = (): boolean => {
    if (!initialSettings.current) return false
    const s = initialSettings.current
    return (
      settings.host !== s.host ||
      settings.ipmToken !== s.ipmToken ||
      settings.ipmeToken !== s.ipmeToken ||
      settings.env !== s.env ||
      settings.ipmVersion !== s.ipmVersion ||
      theme !== initialTheme.current
    )
  }

  const tryClose = () => {
    if (forced) return
    if (isDirty()) {
      setShowDiscardWarning(true)
    } else {
      onClose()
    }
  }

  // #1 Escape key + #8 Enter key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !forced) {
        tryClose()
      }
      if (e.key === 'Enter' && !saving) {
        const active = document.activeElement
        if (active?.closest('button, select')) return
        handleSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  const isIpme = settings.host === 'ipme.integromat.com'

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const result = await getApi().settings.save(settings)
      if (result.success) {
        await getApi().theme.save(theme)
        showToast('Settings saved', 'success')
        onSaved?.()
        onClose()
      } else {
        setError(result.error || 'Connection failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="settings-overlay" onClick={forced ? undefined : tryClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          {!forced && (
            <button className="btn-icon" onClick={tryClose}>
              &times;
            </button>
          )}
        </div>

        {forced && (
          <div className="settings-forced-message">
            A valid token is required to use MakeDiff. Please configure your token below.
          </div>
        )}

        <div className="settings-form">
          {/* Connection Section */}
          <div className="settings-section">
            <div className="settings-section-title">Connection</div>

            <label>
              <span>Host</span>
              <select value={settings.host} onChange={(e) => setSettings({ ...settings, host: e.target.value })}>
                <option value="ipm.integromat.com">ipm.integromat.com</option>
                <option value="ipme.integromat.com">ipme.integromat.com</option>
              </select>
            </label>

            {isIpme ? (
              <TokenField
                key="ipme-token"
                label="IPME Token"
                placeholder="IPME token value"
                value={settings.ipmeToken}
                visible={showIpmeToken}
                onChange={(ipmeToken) => setSettings({ ...settings, ipmeToken })}
                onToggle={() => setShowIpmeToken(!showIpmeToken)}
              />
            ) : (
              <TokenField
                key="ipm-token"
                label="IPM Token"
                placeholder="IPM token value"
                value={settings.ipmToken}
                visible={showIpmToken}
                onChange={(ipmToken) => setSettings({ ...settings, ipmToken })}
                onToggle={() => setShowIpmToken(!showIpmToken)}
              />
            )}
          </div>

          {/* Appearance Section */}
          <div className="settings-section">
            <div className="settings-section-title">Appearance</div>

            <label>
              <span>Theme</span>
              <div className="theme-picker">
                {themeOptions.map((t) => (
                  <button
                    key={t.value}
                    className={`theme-card${theme === t.value ? ' active' : ''}`}
                    onClick={() => {
                      setTheme(t.value)
                      document.documentElement.dataset.theme = t.value
                    }}
                  >
                    <div className="theme-card-preview">
                      <div className="theme-card-bg" style={{ background: t.bg }} />
                      <div className="theme-card-accent" style={{ background: t.accent }} />
                    </div>
                    <span className="theme-card-label">{t.label}</span>
                  </button>
                ))}
              </div>
            </label>
          </div>

          {/* Advanced Section (collapsible) */}
          <div className="settings-section">
            <button
              className="settings-section-title settings-section-toggle"
              onClick={() => setAdvancedOpen(!advancedOpen)}
            >
              <span className="sidebar-section-chevron" data-collapsed={!advancedOpen ? 'true' : undefined} />
              <span>Advanced</span>
            </button>

            {advancedOpen && (
              <label>
                <span>IPM Version</span>
                <input
                  type="text"
                  value={settings.ipmVersion}
                  onChange={(e) => setSettings({ ...settings, ipmVersion: e.target.value })}
                  placeholder="3.20.0"
                />
              </label>
            )}
          </div>

          {error && <div className="error-message">{error}</div>}

          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Verifying...' : 'Save Settings'}
          </button>

          {showDiscardWarning && (
            <div className="settings-discard-warning">
              <span>You have unsaved changes</span>
              <div className="settings-discard-actions">
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setShowDiscardWarning(false)
                    document.documentElement.dataset.theme = initialTheme.current
                    onClose()
                  }}
                >
                  Discard
                </button>
                <button className="btn-secondary" onClick={() => setShowDiscardWarning(false)}>
                  Keep Editing
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
