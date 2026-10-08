import { describe, it, expect, vi, type Mock } from 'vitest'
import { loadRenderer } from '../renderer-loader'

type Load = (target: string) => Promise<void>

function fakeWindow(): { loadURL: Mock<Load>; loadFile: Mock<Load> } {
  return {
    loadURL: vi.fn<Load>().mockResolvedValue(undefined),
    loadFile: vi.fn<Load>().mockResolvedValue(undefined)
  }
}
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 5))

describe('loadRenderer', () => {
  it('loads the dev server url when there is one', () => {
    const win = fakeWindow()
    loadRenderer(win, { devUrl: 'http://localhost:5173', file: '/app/index.html' }, vi.fn())
    expect(win.loadURL).toHaveBeenCalledWith('http://localhost:5173')
    expect(win.loadFile).not.toHaveBeenCalled()
  })

  it.each([undefined, ''])('loads the built file when the dev url is %j', (devUrl) => {
    const win = fakeWindow()
    loadRenderer(win, { devUrl, file: '/app/index.html' }, vi.fn())
    expect(win.loadFile).toHaveBeenCalledWith('/app/index.html')
    expect(win.loadURL).not.toHaveBeenCalled()
  })

  it('reports a failed dev server load', async () => {
    const win = fakeWindow()
    const error = new Error('ERR_CONNECTION_REFUSED')
    win.loadURL.mockRejectedValue(error)
    const onError = vi.fn()
    loadRenderer(win, { devUrl: 'http://localhost:5173', file: '/app/index.html' }, onError)
    await tick()
    expect(onError).toHaveBeenCalledWith(error)
  })

  it('reports a failed file load without an unhandled rejection', async () => {
    const win = fakeWindow()
    const error = new Error('ERR_FILE_NOT_FOUND')
    win.loadFile.mockRejectedValue(error)
    const onError = vi.fn()
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    loadRenderer(win, { file: '/app/index.html' }, onError)
    await tick()
    process.off('unhandledRejection', unhandled)
    expect(onError).toHaveBeenCalledWith(error)
    expect(unhandled).not.toHaveBeenCalled()
  })

  it('does not call onError when the load succeeds', async () => {
    const onError = vi.fn()
    loadRenderer(fakeWindow(), { file: '/app/index.html' }, onError)
    await tick()
    expect(onError).not.toHaveBeenCalled()
  })
})
