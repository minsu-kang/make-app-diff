import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DiffViewer from '../DiffViewer'
import type { FileDiff } from '../../../shared/types'

const PNG = 'data:image/png;base64,iVBORw0KGgo='
const GIF = 'data:image/gif;base64,R0lGODlhAQABAAAAACw='

const image = (status: FileDiff['status'], oldContent: string, newContent: string, filePath: string) =>
  ({ filePath, status, oldContent, newContent, unifiedDiff: '' }) satisfies FileDiff

function renderImage(diff: FileDiff) {
  render(<DiffViewer diffs={[diff]} selectedFile={diff.filePath} />)
}

describe('DiffViewer image alt text', () => {
  it.each([
    { name: 'added', diff: image('added', '', PNG, 'assets/icon.png'), src: PNG },
    { name: 'deleted', diff: image('deleted', GIF, '', 'assets/old.gif'), src: GIF }
  ])('names the preview of $name image after its file', ({ diff, src }) => {
    renderImage(diff)

    expect(screen.getByRole('img', { name: diff.filePath })).toHaveAttribute('src', src)
  })

  it('names both sides of a modified image after the side and the file', () => {
    renderImage(image('modified', PNG, GIF, 'assets/logo.png'))

    expect(screen.getByRole('img', { name: 'Before: assets/logo.png' })).toHaveAttribute('src', PNG)
    expect(screen.getByRole('img', { name: 'After: assets/logo.png' })).toHaveAttribute('src', GIF)
  })

  it('names only the side that holds an image', () => {
    renderImage(image('modified', PNG, '{"a":1}', 'assets/logo.png'))

    expect(screen.getByRole('img', { name: 'Before: assets/logo.png' })).toHaveAttribute('src', PNG)
    expect(screen.queryByRole('img', { name: 'After: assets/logo.png' })).not.toBeInTheDocument()
  })
})
