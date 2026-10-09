import { describe, it, expect, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ToastContainer, { showToast } from '../Toast'

describe('Toast', () => {
  it('renders nothing until a toast is shown', () => {
    const { container } = render(<ToastContainer />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a toast with the type class and dismisses it with the close button', async () => {
    const user = userEvent.setup()
    const { container } = render(<ToastContainer />)

    act(() => showToast('Saved', 'success'))

    expect(screen.getByText('Saved')).toBeInTheDocument()
    expect(container.querySelector('.toast')).toHaveClass('toast-success')

    await user.click(screen.getByRole('button', { name: '×' }))
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it('defaults to the error type', () => {
    const { container } = render(<ToastContainer />)
    act(() => showToast('Boom'))
    expect(container.querySelector('.toast')).toHaveClass('toast-error')
  })

  it('auto-dismisses after 4 seconds', () => {
    vi.useFakeTimers()
    render(<ToastContainer />)

    act(() => showToast('Temporary', 'info'))
    expect(screen.getByText('Temporary')).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(3999))
    expect(screen.getByText('Temporary')).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(1))
    expect(screen.queryByText('Temporary')).not.toBeInTheDocument()
  })

  it('expires each toast on its own timer', () => {
    vi.useFakeTimers()
    render(<ToastContainer />)

    act(() => showToast('First', 'info'))
    act(() => vi.advanceTimersByTime(2000))
    act(() => showToast('Second', 'info'))
    act(() => vi.advanceTimersByTime(2000))

    expect(screen.queryByText('First')).not.toBeInTheDocument()
    expect(screen.getByText('Second')).toBeInTheDocument()
  })

  it('closes only the toast whose button was clicked, even with the same text', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockReturnValue(undefined)
    const user = userEvent.setup()
    render(<ToastContainer />)

    act(() => showToast('A', 'info'))
    act(() => showToast('B', 'info'))
    act(() => showToast('B', 'info'))
    const shownTexts = () => screen.getAllByText(/^[AB]$/).map((el) => el.textContent)
    expect(shownTexts()).toEqual(['A', 'B', 'B'])
    const closeButtons = screen.getAllByRole('button', { name: '×' })
    expect(closeButtons).toHaveLength(3)

    await user.click(closeButtons[2])

    expect(shownTexts()).toEqual(['A', 'B'])
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('ignores showToast after the container unmounts', () => {
    vi.useFakeTimers()
    const { unmount } = render(<ToastContainer />)
    unmount()

    expect(() => showToast('Late')).not.toThrow()
    expect(vi.getTimerCount()).toBe(0)

    render(<ToastContainer />)
    expect(screen.queryByText('Late')).not.toBeInTheDocument()
  })

  it('leaves no timer behind when the container unmounts with a toast showing', () => {
    vi.useFakeTimers()
    const { unmount } = render(<ToastContainer />)
    act(() => showToast('Pending'))
    expect(vi.getTimerCount()).toBe(1)

    unmount()

    expect(vi.getTimerCount()).toBe(0)
  })
})
