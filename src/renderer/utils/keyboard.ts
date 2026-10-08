import type { KeyboardEvent } from 'react'

/** onKeyDown handler that runs `action` on Enter or Space like a native button, ignoring keys bubbling up from children */
export function onActivateKey(action: () => void): (event: KeyboardEvent<HTMLElement>) => void {
  return (event) => {
    if (event.target !== event.currentTarget) return
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    action()
  }
}
