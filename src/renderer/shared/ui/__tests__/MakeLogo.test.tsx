import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import MakeLogo from '../MakeLogo'

const logo = (gradientId: string) => (
  <MakeLogo className="logo" viewBox="0 0 10 10" width="30" height="20" gradientId={gradientId} />
)

describe('MakeLogo', () => {
  it('sets the svg attributes from its props', () => {
    const { container } = render(logo('grad'))

    const svg = container.querySelector('svg')
    expect(svg).toHaveClass('logo')
    expect(svg).toHaveAttribute('viewBox', '0 0 10 10')
    expect(svg).toHaveAttribute('width', '30')
    expect(svg).toHaveAttribute('height', '20')
  })

  it('fills the mark with the gradient it defines', () => {
    const { container } = render(logo('grad'))

    expect(container.querySelector('defs')?.firstElementChild).toHaveAttribute('id', 'grad')
    expect(container.querySelector('path')).toHaveAttribute('fill', 'url(#grad)')
  })

  it('keeps two logos on one page apart by their gradient ids', () => {
    const { container } = render(
      <>
        {logo('first')}
        {logo('second')}
      </>
    )

    const fills = Array.from(container.querySelectorAll('path'), (path) => path.getAttribute('fill'))
    const ids = Array.from(container.querySelectorAll('defs > *'), (gradient) => gradient.getAttribute('id'))
    expect(fills).toEqual(['url(#first)', 'url(#second)'])
    expect(ids).toEqual(['first', 'second'])
  })

  it('draws its children after the mark', () => {
    const { container } = render(
      <MakeLogo className="logo" viewBox="0 0 10 10" width="30" height="20" gradientId="grad">
        <path data-testid="wordmark" />
      </MakeLogo>
    )

    const paths = Array.from(container.querySelectorAll('path'), (path) => path.getAttribute('data-testid'))
    expect(paths).toEqual([null, 'wordmark'])
  })
})
