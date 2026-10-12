import { useEffect } from 'react'
import { showToast } from '../../shared/ui/Toast'
import { getApi } from '../../shared/api/electron-api'

interface SessionSetters {
  setForcedSettings: (value: boolean) => void
  setShowSettings: (value: boolean) => void
}

export function useSession({ setForcedSettings, setShowSettings }: SessionSetters) {
  useEffect(() => {
    getApi()
      .theme.load()
      .then((theme) => {
        document.documentElement.dataset.theme = theme
      })
      .catch((error: unknown) => console.error('Failed to load the theme', error))

    // Check session expiry, then check if token exists
    getApi()
      .session.check()
      .then(({ expired }) => {
        if (expired) {
          showToast('Session expired (48h inactive). Please re-enter your tokens.', 'error')
          setForcedSettings(true)
          setShowSettings(true)
          return
        }
        return getApi()
          .settings.load()
          .then((settings) => {
            const token = settings.host === 'ipme.integromat.com' ? settings.ipmeToken : settings.ipmToken
            if (!token?.trim()) {
              setForcedSettings(true)
              setShowSettings(true)
            } else {
              // Tokens exist and session is valid — enable menu items
              getApi().menu.setEnabled(true)
            }
          })
      })
      .catch((error: unknown) => {
        console.error('Failed to check the session', error)
        showToast('Could not check the session. Open Settings to verify your tokens.', 'error')
      })

    // Periodic session check (every 30 minutes)
    const sessionInterval = setInterval(
      async () => {
        try {
          const { expired } = await getApi().session.check()
          if (expired) {
            showToast('Session expired (48h inactive). Please re-enter your tokens.', 'error')
            getApi().menu.setEnabled(false)
            setForcedSettings(true)
            setShowSettings(true)
          }
        } catch (error) {
          console.error('Failed to check the session', error)
        }
      },
      30 * 60 * 1000
    )

    return () => {
      clearInterval(sessionInterval)
    }
  }, [setForcedSettings, setShowSettings])
}
