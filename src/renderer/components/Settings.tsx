import React, { useState, useEffect } from 'react'

interface IpmSettings {
  host: string
  ipmToken: string
  ipmeToken: string
  env: string
  ipmVersion: string
}

interface SettingsProps {
  onClose: () => void
  forced?: boolean
}

export default function Settings({ onClose, forced }: SettingsProps) {
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

  useEffect(() => {
    window.api.settings.load().then(setSettings)
    window.api.theme.load().then(setTheme)
  }, [])

  const isIpme = settings.host === 'ipme.integromat.com'

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const result = await window.api.settings.save(settings)
      if (result.success) {
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
    <div className="settings-overlay" onClick={forced ? undefined : onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          {!forced && (
            <button className="btn-icon" onClick={onClose}>
              &times;
            </button>
          )}
        </div>

        <div className="settings-form">
          <label>
            <span>Host</span>
            <select value={settings.host} onChange={(e) => setSettings({ ...settings, host: e.target.value })}>
              <option value="ipm.integromat.com">ipm.integromat.com</option>
              <option value="ipme.integromat.com">ipme.integromat.com</option>
            </select>
          </label>

          {isIpme ? (
            <label key="ipme-token">
              <span>IPME Token</span>
              <div className="input-with-icon">
                <input
                  type={showIpmeToken ? 'text' : 'password'}
                  value={settings.ipmeToken}
                  onChange={(e) => setSettings({ ...settings, ipmeToken: e.target.value })}
                  placeholder="IPME token value"
                />
                <button
                  type="button"
                  className="btn-icon token-toggle"
                  onClick={() => setShowIpmeToken(!showIpmeToken)}
                  title={showIpmeToken ? 'Hide token' : 'Show token'}
                >
                  {showIpmeToken ? '\u{1F440}' : '\u{1F441}'}
                </button>
              </div>
            </label>
          ) : (
            <label key="ipm-token">
              <span>IPM Token</span>
              <div className="input-with-icon">
                <input
                  type={showIpmToken ? 'text' : 'password'}
                  value={settings.ipmToken}
                  onChange={(e) => setSettings({ ...settings, ipmToken: e.target.value })}
                  placeholder="IPM token value"
                />
                <button
                  type="button"
                  className="btn-icon token-toggle"
                  onClick={() => setShowIpmToken(!showIpmToken)}
                  title={showIpmToken ? 'Hide token' : 'Show token'}
                >
                  {showIpmToken ? '\u{1F440}' : '\u{1F441}'}
                </button>
              </div>
            </label>
          )}

          <label>
            <span>IPM Version</span>
            <input
              type="text"
              value={settings.ipmVersion}
              onChange={(e) => setSettings({ ...settings, ipmVersion: e.target.value })}
              placeholder="3.20.0"
            />
          </label>

          <label>
            <span>Theme</span>
            <select
              value={theme}
              onChange={(e) => {
                const val = e.target.value
                setTheme(val)
                document.documentElement.setAttribute('data-theme', val)
                window.api.theme.save(val as any)
              }}
            >
              <option value="dark">Dark</option>
              <option value="make">Make</option>
              <option value="light">Light</option>
            </select>
          </label>

          {error && <div className="error-message">{error}</div>}

          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Verifying...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  )
}
