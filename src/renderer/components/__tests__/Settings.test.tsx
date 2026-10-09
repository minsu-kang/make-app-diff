import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Settings from '../Settings'
import ToastContainer from '../Toast'
import { mockApi, type ApiMock } from '../../__tests__/mocks/window-api'
import type { IpmSettings } from '../../../preload/index'

type User = ReturnType<typeof userEvent.setup>

const IPM_HOST = 'ipm.integromat.com'
const IPME_HOST = 'ipme.integromat.com'
const VERSION_LABEL = 'IPM Version'
const SAVED_TOAST = 'Settings saved'
const THEME_ATTR = 'data-theme'
const COLLAPSED_ATTR = 'data-collapsed'
const INVALID_TOKEN = 'Invalid token'
const LOAD_ERROR = 'Store unreadable'
const SHOW_TITLE = 'Show token'
const HIDE_TITLE = 'Hide token'

const ipmStored: IpmSettings = {
  host: IPM_HOST,
  ipmToken: 'token',
  ipmeToken: '',
  env: 'staging',
  ipmVersion: '3.20.0'
}

const ipmeStored: IpmSettings = {
  host: IPME_HOST,
  ipmToken: 'ipm-secret',
  ipmeToken: 'ipme-secret',
  env: 'production',
  ipmVersion: '3.21.0'
}

const hostSelect = () => screen.getByLabelText('Host')
const ipmToken = () => screen.getByLabelText('IPM Token')
const ipmeToken = () => screen.getByLabelText('IPME Token')
const versionField = () => screen.getByLabelText(VERSION_LABEL)
const saveButton = () => screen.getByRole('button', { name: 'Save Settings' })
const closeButton = () => screen.getByRole('button', { name: '×' })
const advancedButton = () => screen.getByRole('button', { name: 'Advanced' })
const advancedChevron = () => advancedButton().querySelector('.sidebar-section-chevron')
const unsavedWarning = () => screen.queryByText('You have unsaved changes')
const themeCard = (label: string) => screen.getByText(label).closest('button') as HTMLElement
const activeThemes = () => ['Dark', 'Make', 'Light'].filter((label) => themeCard(label).classList.contains('active'))
const overlay = () => document.querySelector('.settings-overlay') as HTMLElement

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function mountSettings(props: Partial<Parameters<typeof Settings>[0]> = {}) {
  const onClose = vi.fn()
  const onSaved = vi.fn()
  render(
    <>
      <Settings onClose={onClose} onSaved={onSaved} {...props} />
      <ToastContainer />
    </>
  )
  return { onClose, onSaved }
}

async function renderSettings(
  props: Partial<Parameters<typeof Settings>[0]> = {},
  stored: { settings?: IpmSettings; theme?: string } = {}
) {
  const settings = stored.settings ?? ipmStored
  mockApi().settings.load.mockResolvedValue(settings)
  if (stored.theme) mockApi().theme.load.mockResolvedValue(stored.theme)
  const mounted = mountSettings(props)
  const onIpme = settings.host === IPME_HOST
  await waitFor(() =>
    expect(onIpme ? ipmeToken() : ipmToken()).toHaveValue(onIpme ? settings.ipmeToken : settings.ipmToken)
  )
  return mounted
}

const dirtyEdits: { name: string; stored: { settings?: IpmSettings }; edit: (user: User) => Promise<void> }[] = [
  { name: 'the host', stored: {}, edit: (user) => user.selectOptions(hostSelect(), IPME_HOST) },
  { name: 'the IPM token', stored: {}, edit: (user) => user.type(ipmToken(), 'x') },
  { name: 'the IPME token', stored: { settings: ipmeStored }, edit: (user) => user.type(ipmeToken(), 'x') },
  {
    name: 'the IPM version',
    stored: {},
    edit: async (user) => {
      await user.click(advancedButton())
      await user.type(versionField(), '1')
    }
  },
  { name: 'the theme', stored: {}, edit: (user) => user.click(themeCard('Make')) }
]

const closers: { name: string; close: (user: User) => Promise<void> }[] = [
  { name: 'Escape', close: (user) => user.keyboard('{Escape}') },
  { name: 'the close button', close: (user) => user.click(closeButton()) },
  { name: 'a click on the backdrop', close: (user) => user.click(overlay()) }
]

const saveFailures: { name: string; arrange: (api: ApiMock) => void; message: string }[] = [
  {
    name: 'the settings save rejects with an Error',
    arrange: (api) => api.settings.save.mockRejectedValue(new Error('Disk full')),
    message: 'Disk full'
  },
  {
    name: 'the settings save rejects with a plain value',
    arrange: (api) => api.settings.save.mockRejectedValue('plain failure'),
    message: 'plain failure'
  },
  {
    name: 'the theme save rejects after the settings were saved',
    arrange: (api) => api.theme.save.mockRejectedValue(new Error('Theme store down')),
    message: 'Theme store down'
  }
]

const missingReasons: { name: string; result: { success: boolean; error?: string } }[] = [
  { name: 'no error text', result: { success: false } },
  { name: 'an empty error text', result: { success: false, error: '' } }
]

const loadFailures: { name: string; arrange: (api: ApiMock) => void; message: string }[] = [
  {
    name: 'the settings load rejects with an Error',
    arrange: (api) => api.settings.load.mockRejectedValue(new Error(LOAD_ERROR)),
    message: LOAD_ERROR
  },
  {
    name: 'the theme load rejects with a plain value',
    arrange: (api) => api.theme.load.mockRejectedValue('theme broken'),
    message: 'theme broken'
  }
]

const themePicks = [
  { label: 'Make', value: 'make', from: 'dark' },
  { label: 'Light', value: 'light', from: 'dark' },
  { label: 'Dark', value: 'dark', from: 'light' }
]

describe('Settings', () => {
  it('loads the stored settings and swaps the token field with the host', async () => {
    const user = userEvent.setup()
    await renderSettings()

    expect(hostSelect()).toHaveValue(IPM_HOST)

    await user.selectOptions(hostSelect(), IPME_HOST)
    expect(ipmeToken()).toHaveValue('')
    expect(screen.queryByLabelText('IPM Token')).not.toBeInTheDocument()
  })

  it('reveals the token and the advanced IPM version', async () => {
    const user = userEvent.setup()
    await renderSettings()
    expect(ipmToken()).toHaveAttribute('type', 'password')

    await user.click(screen.getByTitle(SHOW_TITLE))
    expect(ipmToken()).toHaveAttribute('type', 'text')

    await user.click(advancedButton())
    expect(versionField()).toHaveValue('3.20.0')
  })

  it('saves settings and theme, then notifies and closes', async () => {
    const user = userEvent.setup()
    const api = mockApi()
    const { onClose, onSaved } = await renderSettings()

    await user.clear(ipmToken())
    await user.type(ipmToken(), 'new-token')
    await user.click(screen.getByText('Make'))
    await user.click(saveButton())

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(api.settings.save).toHaveBeenCalledWith(expect.objectContaining({ ipmToken: 'new-token' }))
    expect(api.theme.save).toHaveBeenCalledWith('make')
    expect(onSaved).toHaveBeenCalledOnce()
    expect(screen.getByText(SAVED_TOAST)).toBeInTheDocument()
  })

  it('keeps the dialog open and shows the error when verification fails', async () => {
    const user = userEvent.setup()
    const api = mockApi()
    api.settings.save.mockResolvedValue({ success: false, error: INVALID_TOKEN })
    const { onClose } = await renderSettings()

    await user.click(saveButton())

    expect(await screen.findByText(INVALID_TOKEN)).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    expect(api.theme.save).not.toHaveBeenCalled()
  })

  it('closes on Escape when clean and warns before discarding when dirty, reverting the theme', async () => {
    const user = userEvent.setup()
    const { onClose } = await renderSettings()

    await user.click(screen.getByText('Light'))
    expect(document.documentElement).toHaveAttribute(THEME_ATTR, 'light')

    await user.keyboard('{Escape}')
    expect(unsavedWarning()).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Discard' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(document.documentElement).toHaveAttribute(THEME_ATTR, 'dark')
  })

  it('cannot be dismissed while forced and explains why', async () => {
    const user = userEvent.setup()
    const { onClose } = await renderSettings({ forced: true })

    expect(screen.getByText(/A valid token is required/)).toBeInTheDocument()
    await user.keyboard('{Escape}')

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: '×' })).not.toBeInTheDocument()
  })

  it('shows the defaults until the stored settings arrive, then the stored values and theme', async () => {
    const api = mockApi()
    const stored = deferred<IpmSettings>()
    api.settings.load.mockReturnValue(stored.promise)
    api.theme.load.mockResolvedValue('light')
    mountSettings()

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    expect(hostSelect()).toHaveValue(IPME_HOST)
    expect(ipmeToken()).toHaveValue('')
    expect(activeThemes()).toEqual(['Dark'])

    stored.resolve(ipmStored)

    await waitFor(() => expect(ipmToken()).toHaveValue('token'))
    expect(hostSelect()).toHaveValue(IPM_HOST)
    expect(activeThemes()).toEqual(['Light'])
  })

  it('keeps both tokens while switching hosts and saves the full settings for the chosen host', async () => {
    const user = userEvent.setup()
    const api = mockApi()
    await renderSettings()

    await user.selectOptions(hostSelect(), IPME_HOST)
    await user.type(ipmeToken(), 'ipme-new')
    await user.selectOptions(hostSelect(), IPM_HOST)
    expect(ipmToken()).toHaveValue('token')
    await user.selectOptions(hostSelect(), IPME_HOST)
    expect(ipmeToken()).toHaveValue('ipme-new')

    await user.click(saveButton())

    await waitFor(() => expect(api.settings.save).toHaveBeenCalledOnce())
    expect(api.settings.save).toHaveBeenCalledWith({
      host: IPME_HOST,
      ipmToken: 'token',
      ipmeToken: 'ipme-new',
      env: 'staging',
      ipmVersion: '3.20.0'
    })
  })

  it('leaves the stored environment alone when the host changes', async () => {
    const user = userEvent.setup()
    const api = mockApi()
    await renderSettings({}, { settings: ipmeStored })

    await user.selectOptions(hostSelect(), IPM_HOST)
    expect(ipmToken()).toHaveValue('ipm-secret')
    await user.click(saveButton())

    await waitFor(() => expect(api.settings.save).toHaveBeenCalledOnce())
    expect(api.settings.save).toHaveBeenCalledWith({ ...ipmeStored, host: IPM_HOST })
  })

  it('types into and reveals the IPME token with its own toggle', async () => {
    const user = userEvent.setup()
    await renderSettings({}, { settings: ipmeStored })
    expect(ipmeToken()).toHaveAttribute('type', 'password')

    await user.clear(ipmeToken())
    await user.type(ipmeToken(), 'fresh')
    await user.click(screen.getByTitle(SHOW_TITLE))
    expect(ipmeToken()).toHaveAttribute('type', 'text')
    expect(ipmeToken()).toHaveValue('fresh')

    await user.click(screen.getByTitle(HIDE_TITLE))
    expect(ipmeToken()).toHaveAttribute('type', 'password')
    expect(screen.queryByTitle(HIDE_TITLE)).not.toBeInTheDocument()
  })

  it('hides the IPM token again after revealing it', async () => {
    const user = userEvent.setup()
    await renderSettings()

    await user.click(screen.getByTitle(SHOW_TITLE))
    await user.click(screen.getByTitle(HIDE_TITLE))

    expect(ipmToken()).toHaveAttribute('type', 'password')
    expect(ipmToken()).toHaveValue('token')
  })

  it('collapses Advanced by default and still saves an IPM version edited before collapsing it again', async () => {
    const user = userEvent.setup()
    const api = mockApi()
    await renderSettings()
    expect(screen.queryByLabelText(VERSION_LABEL)).not.toBeInTheDocument()
    expect(advancedChevron()).toHaveAttribute(COLLAPSED_ATTR, 'true')

    await user.click(advancedButton())
    expect(advancedChevron()).not.toHaveAttribute(COLLAPSED_ATTR)
    await user.clear(versionField())
    expect(screen.getByPlaceholderText('3.20.0')).toHaveValue('')
    await user.type(versionField(), '4.0.1')

    await user.click(advancedButton())
    expect(screen.queryByLabelText(VERSION_LABEL)).not.toBeInTheDocument()
    expect(advancedChevron()).toHaveAttribute(COLLAPSED_ATTR, 'true')

    await user.click(saveButton())
    await waitFor(() => expect(api.settings.save).toHaveBeenCalledOnce())
    expect(api.settings.save).toHaveBeenCalledWith(expect.objectContaining({ ipmVersion: '4.0.1' }))
  })

  it.each(dirtyEdits)('asks before discarding after changing $name', async ({ stored, edit }) => {
    const user = userEvent.setup()
    const { onClose } = await renderSettings({}, stored)

    await edit(user)
    await user.keyboard('{Escape}')

    expect(unsavedWarning()).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('treats edits that were put back as unchanged', async () => {
    const user = userEvent.setup()
    const { onClose } = await renderSettings()

    await user.clear(ipmToken())
    await user.type(ipmToken(), 'other')
    await user.clear(ipmToken())
    await user.type(ipmToken(), 'token')
    await user.click(themeCard('Make'))
    await user.click(themeCard('Dark'))
    await user.keyboard('{Escape}')

    expect(unsavedWarning()).not.toBeInTheDocument()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it.each(closers)('closes right away with $name when nothing changed', async ({ close }) => {
    const user = userEvent.setup()
    const { onClose } = await renderSettings()

    await close(user)

    expect(onClose).toHaveBeenCalledOnce()
    expect(unsavedWarning()).not.toBeInTheDocument()
  })

  it.each(closers)('warns instead of closing with $name when something changed', async ({ close }) => {
    const user = userEvent.setup()
    const { onClose } = await renderSettings()

    await user.type(ipmToken(), 'x')
    await close(user)

    expect(unsavedWarning()).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('ignores clicks inside the panel', async () => {
    const user = userEvent.setup()
    const { onClose } = await renderSettings()

    await user.click(screen.getByRole('heading', { name: 'Settings' }))
    await user.click(screen.getByText('Connection'))

    expect(onClose).not.toHaveBeenCalled()
    expect(unsavedWarning()).not.toBeInTheDocument()
  })

  it('keeps the edits and the previewed theme when Keep Editing is chosen', async () => {
    const user = userEvent.setup()
    const { onClose } = await renderSettings()

    await user.type(ipmToken(), '-kept')
    await user.click(themeCard('Light'))
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Keep Editing' }))

    expect(unsavedWarning()).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    expect(ipmToken()).toHaveValue('token-kept')
    expect(document.documentElement).toHaveAttribute(THEME_ATTR, 'light')
    expect(activeThemes()).toEqual(['Light'])

    await user.keyboard('{Escape}')
    expect(unsavedWarning()).toBeInTheDocument()
  })

  it('discards by restoring the stored theme and leaves without saving anything', async () => {
    const user = userEvent.setup()
    const api = mockApi()
    const { onClose, onSaved } = await renderSettings({}, { theme: 'make' })

    await user.click(themeCard('Light'))
    expect(document.documentElement).toHaveAttribute(THEME_ATTR, 'light')
    await user.click(closeButton())
    await user.click(screen.getByRole('button', { name: 'Discard' }))

    expect(document.documentElement).toHaveAttribute(THEME_ATTR, 'make')
    expect(onClose).toHaveBeenCalledOnce()
    expect(onSaved).not.toHaveBeenCalled()
    expect(api.settings.save).not.toHaveBeenCalled()
    expect(api.theme.save).not.toHaveBeenCalled()
  })

  it.each(themePicks)('previews the $label theme at once and persists it only on save', async (pick) => {
    const user = userEvent.setup()
    const api = mockApi()
    await renderSettings({}, { theme: pick.from })

    await user.click(themeCard(pick.label))

    expect(document.documentElement).toHaveAttribute(THEME_ATTR, pick.value)
    expect(activeThemes()).toEqual([pick.label])
    expect(api.theme.save).not.toHaveBeenCalled()

    await user.click(saveButton())
    await waitFor(() => expect(api.theme.save).toHaveBeenCalledWith(pick.value))
  })

  it('shows Verifying while saving, ignores Enter meanwhile, then closes with a success toast', async () => {
    const user = userEvent.setup()
    const api = mockApi()
    const pending = deferred<{ success: boolean }>()
    api.settings.save.mockReturnValue(pending.promise)
    const { onClose } = await renderSettings()

    await user.click(saveButton())
    expect(await screen.findByRole('button', { name: 'Verifying...' })).toBeDisabled()
    await user.click(ipmToken())
    await user.keyboard('{Enter}')
    expect(api.settings.save).toHaveBeenCalledOnce()
    expect(onClose).not.toHaveBeenCalled()

    pending.resolve({ success: true })

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(api.theme.save).toHaveBeenCalledOnce()
    expect(screen.getByText(SAVED_TOAST).closest('.toast')).toHaveClass('toast-success')
  })

  it('saves on Enter from a text field', async () => {
    const user = userEvent.setup()
    const api = mockApi()
    const { onClose } = await renderSettings()

    await user.type(ipmToken(), '-enter{Enter}')

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(api.settings.save).toHaveBeenCalledOnce()
    expect(api.settings.save).toHaveBeenCalledWith(expect.objectContaining({ ipmToken: 'token-enter' }))
  })

  it('saves on Enter when nothing is focused', async () => {
    const user = userEvent.setup()
    const api = mockApi()
    const { onClose } = await renderSettings()

    await user.click(screen.getByRole('heading', { name: 'Settings' }))
    await user.keyboard('{Enter}')

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(api.settings.save).toHaveBeenCalledOnce()
  })

  it('does not save on Enter from a select or a button', async () => {
    const user = userEvent.setup()
    const api = mockApi()
    await renderSettings()

    await user.click(hostSelect())
    await user.keyboard('{Enter}')
    await user.click(screen.getByTitle(SHOW_TITLE))
    await user.keyboard('{Enter}')
    await user.click(themeCard('Light'))
    await user.keyboard('{Enter}')

    expect(api.settings.save).not.toHaveBeenCalled()
    expect(ipmToken()).toHaveAttribute('type', 'password')
    expect(activeThemes()).toEqual(['Light'])
  })

  it.each(missingReasons)('shows a fallback message when verification fails with $name', async ({ result }) => {
    const user = userEvent.setup()
    const api = mockApi()
    api.settings.save.mockResolvedValue(result)
    const { onClose, onSaved } = await renderSettings()

    await user.click(saveButton())

    expect(await screen.findByText('Connection failed')).toBeInTheDocument()
    expect(saveButton()).toBeEnabled()
    expect(onClose).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
    expect(api.theme.save).not.toHaveBeenCalled()
    expect(screen.queryByText(SAVED_TOAST)).not.toBeInTheDocument()
  })

  it.each(saveFailures)('shows the message and stays open when $name', async ({ arrange, message }) => {
    const user = userEvent.setup()
    arrange(mockApi())
    const { onClose, onSaved } = await renderSettings()

    await user.click(saveButton())

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(saveButton()).toBeEnabled()
    expect(onClose).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
    expect(screen.queryByText(SAVED_TOAST)).not.toBeInTheDocument()
  })

  it('clears the previous error when the next save succeeds', async () => {
    const user = userEvent.setup()
    const api = mockApi()
    api.settings.save.mockResolvedValueOnce({ success: false, error: INVALID_TOKEN })
    const { onClose } = await renderSettings()

    await user.click(saveButton())
    expect(await screen.findByText(INVALID_TOKEN)).toBeInTheDocument()

    await user.click(saveButton())

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(screen.queryByText(INVALID_TOKEN)).not.toBeInTheDocument()
  })

  it('saves and closes without an onSaved callback', async () => {
    const user = userEvent.setup()
    const api = mockApi()
    const { onClose } = await renderSettings({ onSaved: undefined })

    await user.click(saveButton())

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(api.settings.save).toHaveBeenCalledOnce()
    expect(screen.getByText(SAVED_TOAST)).toBeInTheDocument()
  })

  it.each(loadFailures)('shows the error when $name', async ({ arrange, message }) => {
    arrange(mockApi())
    mountSettings()

    expect(await screen.findByText(message)).toBeInTheDocument()
  })

  it('cannot tell what changed after a failed load, so Escape closes without asking', async () => {
    const user = userEvent.setup()
    mockApi().settings.load.mockRejectedValue(new Error(LOAD_ERROR))
    const { onClose } = mountSettings()
    await screen.findByText(LOAD_ERROR)

    await user.type(ipmeToken(), 'typed')
    await user.keyboard('{Escape}')

    expect(unsavedWarning()).not.toBeInTheDocument()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('ignores the backdrop and Escape while forced even with edits, but still saves and closes', async () => {
    const user = userEvent.setup()
    const { onClose, onSaved } = await renderSettings({ forced: true })

    await user.type(ipmToken(), '-forced')
    await user.click(overlay())
    await user.keyboard('{Escape}')

    expect(unsavedWarning()).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()

    await user.click(saveButton())

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(mockApi().settings.save).toHaveBeenCalledWith(expect.objectContaining({ ipmToken: 'token-forced' }))
    expect(onSaved).toHaveBeenCalledOnce()
  })
})
