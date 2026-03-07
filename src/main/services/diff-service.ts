import { createTwoFilesPatch } from 'diff'
import { ExtractedFile, FileDiff, DiffResult, ComponentType } from '../types'

export function computeDiff(type: ComponentType, oldFiles: ExtractedFile[], newFiles: ExtractedFile[]): DiffResult {
  const oldMap = new Map(oldFiles.map((f) => [f.path, f.content]))
  const newMap = new Map(newFiles.map((f) => [f.path, f.content]))

  const allPaths = new Set([...oldMap.keys(), ...newMap.keys()])
  const diffs: FileDiff[] = []

  for (const filePath of Array.from(allPaths).sort()) {
    const oldContent = oldMap.get(filePath) ?? ''
    const newContent = newMap.get(filePath) ?? ''

    let status: FileDiff['status']
    if (!oldMap.has(filePath)) {
      status = 'added'
    } else if (!newMap.has(filePath)) {
      status = 'deleted'
    } else if (oldContent === newContent) {
      status = 'unchanged'
    } else {
      status = 'modified'
    }

    if (status === 'unchanged') continue

    const maxLines = Math.max(oldContent.split('\n').length, newContent.split('\n').length)
    const unifiedDiff = createTwoFilesPatch(`a/${filePath}`, `b/${filePath}`, oldContent, newContent, '', '', {
      context: maxLines
    })

    diffs.push({ filePath, status, oldContent, newContent, unifiedDiff })
  }

  const summary = {
    added: diffs.filter((d) => d.status === 'added').length,
    deleted: diffs.filter((d) => d.status === 'deleted').length,
    modified: diffs.filter((d) => d.status === 'modified').length,
    unchanged: Array.from(allPaths).length - diffs.length
  }

  return { type, diffs, summary }
}
