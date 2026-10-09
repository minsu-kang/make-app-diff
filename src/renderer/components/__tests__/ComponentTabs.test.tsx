import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ComponentTabs from '../ComponentTabs'

const noSummaries = { app: null, account: null, hook: null }

describe('ComponentTabs', () => {
  it('renders the three tabs and marks the active one', () => {
    render(<ComponentTabs activeTab="account" onTabChange={vi.fn()} summaries={noSummaries} />)

    expect(screen.getByRole('button', { name: 'App' })).not.toHaveClass('active')
    expect(screen.getByRole('button', { name: 'Connection' })).toHaveClass('active')
    expect(screen.getByRole('button', { name: 'Webhook' })).not.toHaveClass('active')
  })

  it('calls onTabChange with the clicked tab key', async () => {
    const user = userEvent.setup()
    const onTabChange = vi.fn()
    render(<ComponentTabs activeTab="app" onTabChange={onTabChange} summaries={noSummaries} />)

    await user.click(screen.getByRole('button', { name: 'Webhook' }))

    expect(onTabChange).toHaveBeenCalledExactlyOnceWith('hook')
  })

  it('shows only the non-zero change badges', () => {
    render(
      <ComponentTabs
        activeTab="app"
        onTabChange={vi.fn()}
        summaries={{
          app: { added: 2, deleted: 0, modified: 5 },
          account: null,
          hook: { added: 0, deleted: 0, modified: 0 }
        }}
      />
    )

    expect(screen.getByText('+2')).toHaveClass('tab-badge-add')
    expect(screen.getByText('~5')).toHaveClass('tab-badge-mod')
    expect(screen.queryByText(/^-\d/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Webhook' }).querySelector('.tab-badges')).toBeNull()
  })

  it('shows the VS Code button only when a handler is given', async () => {
    const user = userEvent.setup()
    const onOpenVscode = vi.fn()
    const { rerender } = render(<ComponentTabs activeTab="app" onTabChange={vi.fn()} summaries={noSummaries} />)
    expect(screen.queryByTitle('Open in VS Code')).not.toBeInTheDocument()

    rerender(
      <ComponentTabs activeTab="app" onTabChange={vi.fn()} summaries={noSummaries} onOpenVscode={onOpenVscode} />
    )
    await user.click(screen.getByTitle('Open in VS Code'))

    expect(onOpenVscode).toHaveBeenCalledOnce()
  })

  it('toggles between SDK and Raw labels for custom apps', async () => {
    const user = userEvent.setup()
    const onDecompileToggle = vi.fn()
    const props = { activeTab: 'app' as const, onTabChange: vi.fn(), summaries: noSummaries, onDecompileToggle }

    const { rerender } = render(<ComponentTabs {...props} isCustomApp={false} decompile />)
    expect(screen.queryByText('SDK')).not.toBeInTheDocument()

    rerender(<ComponentTabs {...props} isCustomApp decompile />)
    expect(screen.getByTitle('Switch to raw compiled view')).toHaveTextContent('SDK')

    rerender(<ComponentTabs {...props} isCustomApp decompile={false} />)
    await user.click(screen.getByTitle('Switch to SDK decompiled view'))

    expect(screen.getByText('Raw')).toBeInTheDocument()
    expect(onDecompileToggle).toHaveBeenCalledOnce()
  })
})
