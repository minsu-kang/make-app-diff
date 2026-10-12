import type { FormEvent } from 'react'
import { describe, it, expect, vi, type Mock } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TokenField from '../TokenField'

type Props = Parameters<typeof TokenField>[0]

const SHOW_TITLE = 'Show token'
const HIDE_TITLE = 'Hide token'
const EYE_SHAPE = 'circle'
const EYE_OFF_SHAPE = 'path[d="M2 2l12 12"]'

function renderField(overrides: Partial<Props> = {}) {
  const onChange = vi.fn()
  const onToggle = vi.fn()
  render(
    <TokenField
      label="IPM Token"
      placeholder="IPM token value"
      value="secret"
      visible={false}
      onChange={onChange}
      onToggle={onToggle}
      {...overrides}
    />
  )
  return { onChange, onToggle }
}

const input = () => screen.getByLabelText('IPM Token')
const toggle = (title: string) => screen.getByTitle(title)

const visibility = [
  { name: 'hidden', visible: false, type: 'password', title: SHOW_TITLE, shape: EYE_SHAPE, absent: EYE_OFF_SHAPE },
  { name: 'visible', visible: true, type: 'text', title: HIDE_TITLE, shape: EYE_OFF_SHAPE, absent: EYE_SHAPE }
]

describe('TokenField', () => {
  it('shows the value and the placeholder in the input', () => {
    renderField()

    expect(input()).toHaveValue('secret')
    expect(input()).toHaveAttribute('placeholder', 'IPM token value')
  })

  it('labels the input with the given label', () => {
    renderField({ label: 'IPME Token', value: 'abc' })

    expect(screen.getByLabelText('IPME Token')).toHaveValue('abc')
    expect(screen.queryByLabelText('IPM Token')).not.toBeInTheDocument()
  })

  it.each(visibility)('masks the token as $type and offers "$title" when $name', ({ visible, type, title }) => {
    renderField({ visible })

    expect(input()).toHaveAttribute('type', type)
    expect(toggle(title)).toBeInTheDocument()
  })

  it.each(visibility)('draws the matching icon when $name', ({ visible, title, shape, absent }) => {
    renderField({ visible })

    const icon = toggle(title).querySelector('svg') as SVGElement
    expect(icon.querySelector(shape)).toBeInTheDocument()
    expect(icon.querySelector(absent)).not.toBeInTheDocument()
    expect(icon).toHaveAttribute('width', '16')
    expect(icon).toHaveAttribute('height', '16')
    expect(icon).toHaveAttribute('viewBox', '0 0 16 16')
    expect(icon).toHaveAttribute('fill', 'none')
    expect(icon).toHaveAttribute('stroke', 'currentColor')
    expect(icon).toHaveAttribute('stroke-width', '1.5')
    expect(icon).toHaveAttribute('stroke-linecap', 'round')
    expect(icon).toHaveAttribute('stroke-linejoin', 'round')
  })

  it('reports each typed character as a plain string', async () => {
    const user = userEvent.setup()
    const { onChange } = renderField({ value: '' })

    await user.type(input(), 'ab')

    expect(onChange).toHaveBeenNthCalledWith(1, 'a')
    expect(onChange).toHaveBeenNthCalledWith(2, 'b')
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('calls onToggle once per click on the eye button and leaves the value alone', async () => {
    const user = userEvent.setup()
    const { onChange, onToggle } = renderField()

    await user.click(toggle(SHOW_TITLE))

    expect(onToggle).toHaveBeenCalledOnce()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('styles the eye button as an icon toggle', () => {
    renderField()

    expect(toggle(SHOW_TITLE)).toHaveClass('btn-icon', 'token-toggle')
  })

  it('does not submit an enclosing form when the eye button is clicked', async () => {
    const user = userEvent.setup()
    const onSubmit: Mock<(e: FormEvent) => void> = vi.fn((e) => e.preventDefault())
    render(
      <form onSubmit={onSubmit}>
        <TokenField
          label="IPM Token"
          placeholder="IPM token value"
          value="secret"
          visible={false}
          onChange={vi.fn()}
          onToggle={vi.fn()}
        />
      </form>
    )

    await user.click(toggle(SHOW_TITLE))

    expect(onSubmit).not.toHaveBeenCalled()
  })
})
