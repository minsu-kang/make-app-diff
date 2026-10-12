import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import EmptyState from '../EmptyState'
import AboutModal from '../AboutModal'

describe('EmptyState', () => {
  it('invites the user to search for an app and lists the shortcuts', () => {
    render(<EmptyState />)

    expect(screen.getByRole('heading', { name: 'MakeDiff' })).toBeInTheDocument()
    expect(screen.getByText('make.com')).toBeInTheDocument()
    expect(screen.getByText('Search for an app in the sidebar to get started.')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
    expect(screen.getByText('Download')).toBeInTheDocument()
  })

  it('keeps its logo gradient apart from the one in the About dialog', () => {
    const { container } = render(
      <>
        <EmptyState />
        <AboutModal onClose={vi.fn()} />
      </>
    )

    const ids = Array.from(container.querySelectorAll('defs > *'), (gradient) => gradient.getAttribute('id'))
    expect(ids).toEqual(['make-grad', 'make-grad-about'])
  })
})
