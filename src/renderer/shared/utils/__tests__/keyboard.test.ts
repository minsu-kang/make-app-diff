import { describe, it, expect, vi } from 'vitest'
import type { KeyboardEvent } from 'react'
import { onActivateKey } from '../keyboard'

function keyEvent(key: string, sameTarget = true): { event: KeyboardEvent<HTMLElement>; preventDefault: () => void } {
  const element = {} as HTMLElement
  const preventDefault = vi.fn()
  const event = { key, target: sameTarget ? element : ({} as HTMLElement), currentTarget: element, preventDefault }
  return { event: event as unknown as KeyboardEvent<HTMLElement>, preventDefault }
}

describe('onActivateKey', () => {
  it.each(['Enter', ' '])('runs the action on %j and prevents the default', (key) => {
    const action = vi.fn()
    const { event, preventDefault } = keyEvent(key)
    onActivateKey(action)(event)
    expect(action).toHaveBeenCalledTimes(1)
    expect(preventDefault).toHaveBeenCalledTimes(1)
  })

  it.each(['Tab', 'Escape', 'a', 'ArrowDown', 'Spacebar'])('ignores %j', (key) => {
    const action = vi.fn()
    const { event, preventDefault } = keyEvent(key)
    onActivateKey(action)(event)
    expect(action).not.toHaveBeenCalled()
    expect(preventDefault).not.toHaveBeenCalled()
  })

  it('ignores keys that bubble up from a child element', () => {
    const action = vi.fn()
    const { event, preventDefault } = keyEvent('Enter', false)
    onActivateKey(action)(event)
    expect(action).not.toHaveBeenCalled()
    expect(preventDefault).not.toHaveBeenCalled()
  })
})
