import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AboutModal from '../AboutModal'

const heading = () => screen.getByRole('heading', { name: 'About' })
const row = (label: string) => within(screen.getByText(label).parentElement as HTMLElement)

describe('AboutModal', () => {
  it('lists the application and runtime versions', () => {
    Object.assign(window, {
      appVersion: { app: '9.8.7', electron: '31.0.1', chrome: '126.0.2', node: '20.11.0' }
    })
    render(<AboutModal onClose={vi.fn()} />)

    expect(screen.getByRole('heading', { level: 3, name: 'MakeDiff' })).toBeInTheDocument()
    expect(screen.getByText('App version diff viewer')).toBeInTheDocument()
    expect(row('Version').getByText('9.8.7')).toBeInTheDocument()
    expect(row('Electron').getByText('31.0.1')).toBeInTheDocument()
    expect(row('Chrome').getByText('126.0.2')).toBeInTheDocument()
    expect(row('Node').getByText('20.11.0')).toBeInTheDocument()
    expect(screen.getByText(`© ${new Date().getFullYear()} Minsu Kang`)).toBeInTheDocument()
  })

  it('falls back to placeholders when the versions are not exposed', () => {
    Object.assign(window, { appVersion: undefined })
    render(<AboutModal onClose={vi.fn()} />)

    expect(row('Version').getByText('1.0.0')).toBeInTheDocument()
    expect(row('Electron').getByText('-')).toBeInTheDocument()
    expect(row('Chrome').getByText('-')).toBeInTheDocument()
    expect(row('Node').getByText('-')).toBeInTheDocument()
  })

  it('draws the logo with its own gradient', () => {
    const { container } = render(<AboutModal onClose={vi.fn()} />)

    expect(container.querySelector('svg.info-make-logo defs')?.firstElementChild).toHaveAttribute(
      'id',
      'make-grad-about'
    )
  })

  it('closes when the overlay is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<AboutModal onClose={onClose} />)

    await user.click(heading().closest('.settings-overlay') as HTMLElement)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('stays open when the panel itself is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<AboutModal onClose={onClose} />)

    await user.click(heading())
    await user.click(screen.getByText('App version diff viewer'))

    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes with the close button', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<AboutModal onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: '✕' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
