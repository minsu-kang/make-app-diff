import { describe, it, expect } from 'vitest'
import { getApi, getAppVersion, getMenuEvents } from '../electron-api'
import { mockApi, mockMenu } from '../../../__tests__/mocks/window-api'
import type { ElectronApi } from '../../types'

describe('electron-api', () => {
  it('returns the bridge that is installed on window', () => {
    expect(getApi()).toBe(mockApi())
    expect(getMenuEvents()).toBe(mockMenu())
    expect(getAppVersion()).toEqual({ app: '0.0.0-test', electron: '0.0.0', chrome: '0.0.0', node: '0.0.0' })
  })

  it('reads window on every call, so a bridge installed later is picked up', () => {
    const replacement = {} as ElectronApi
    const first = getApi()

    Object.assign(window, { api: replacement })

    expect(getApi()).toBe(replacement)
    expect(getApi()).not.toBe(first)
  })

  it('returns undefined when the versions are not exposed', () => {
    Object.assign(window, { appVersion: undefined })

    expect(getAppVersion()).toBeUndefined()
  })
})
