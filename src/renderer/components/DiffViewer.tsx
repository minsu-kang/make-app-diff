import React, { useEffect, useRef, useState, useCallback } from 'react'
import { html, parse } from 'diff2html'
import 'diff2html/bundles/css/diff2html.min.css'

interface FileDiff {
  filePath: string
  status: 'added' | 'deleted' | 'modified' | 'unchanged'
  oldContent: string
  newContent: string
  unifiedDiff: string
}

interface DiffViewerProps {
  diffs: FileDiff[]
  selectedFile: string | null
}

export default function DiffViewer({ diffs, selectedFile }: DiffViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDark, setIsDark] = useState(true)
  const activeSideRef = useRef<'left' | 'right' | null>(null)

  const visibleDiffs = selectedFile ? diffs.filter((d) => d.filePath === selectedFile) : diffs

  // Track which side the user last clicked on
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    const sideEl = target.closest('.d2h-file-side-diff')
    if (!sideEl) return
    const wrapper = sideEl.parentElement
    if (!wrapper) return
    const sides = wrapper.querySelectorAll('.d2h-file-side-diff')
    activeSideRef.current = sideEl === sides[0] ? 'left' : 'right'
  }, [])

  // Cmd+A: select only the active side
  // Copy: strip empty placeholder rows
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const handleKeyDown = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        const side = activeSideRef.current || 'left'
        const sides = el.querySelectorAll('.d2h-file-side-diff')
        const target = side === 'left' ? sides[0] : sides[1]
        if (!target) return

        e.preventDefault()
        const sel = window.getSelection()
        if (!sel) return
        const range = document.createRange()
        range.selectNodeContents(target)
        sel.removeAllRanges()
        sel.addRange(range)
      }
    }

    const handleCopy = (e: ClipboardEvent): void => {
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0) return

      // Find which side is selected — walk up from the anchor node
      let node: Node | null = sel.anchorNode
      let sideEl: Element | null = null
      while (node && node !== el) {
        if (node instanceof Element && node.classList.contains('d2h-file-side-diff')) {
          sideEl = node
          break
        }
        node = node.parentNode
      }
      if (!sideEl) return

      // Collect code lines, skipping empty placeholders
      const rows = sideEl.querySelectorAll('tr')
      const lines: string[] = []
      for (const row of rows) {
        if (!sel.containsNode(row, true)) continue
        const lineCell = row.querySelector('.d2h-code-side-line')
        if (!lineCell || lineCell.classList.contains('d2h-code-side-emptyplaceholder')) continue
        const content = row.querySelector('.d2h-code-line-ctn')
        if (content) {
          lines.push(content.textContent || '')
        }
      }

      if (lines.length > 0) {
        e.preventDefault()
        e.clipboardData?.setData('text/plain', lines.join('\n'))
      }
    }

    el.addEventListener('keydown', handleKeyDown)
    el.addEventListener('copy', handleCopy)
    return () => {
      el.removeEventListener('keydown', handleKeyDown)
      el.removeEventListener('copy', handleCopy)
    }
  }, [])

  // Observe theme changes reactively
  useEffect(() => {
    const root = document.documentElement
    const updateTheme = () => {
      setIsDark(root.getAttribute('data-theme') !== 'light')
    }
    updateTheme()

    const observer = new MutationObserver(updateTheme)
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!containerRef.current || visibleDiffs.length === 0) return

    // added/deleted files → line-by-line (unified), modified → side-by-side
    const isOneSided =
      visibleDiffs.length === 1 && (visibleDiffs[0].status === 'added' || visibleDiffs[0].status === 'deleted')

    const combinedDiff = visibleDiffs.map((d) => d.unifiedDiff).join('\n')
    const diffJson = parse(combinedDiff)
    const diffHtml = html(diffJson, {
      drawFileList: false,
      matching: 'lines',
      outputFormat: isOneSided ? 'line-by-line' : 'side-by-side',
      renderNothingWhenEmpty: false
    })

    containerRef.current.innerHTML = diffHtml
  }, [visibleDiffs])

  if (diffs.length === 0) {
    return (
      <div className="diff-viewer-empty">
        <p>No differences found</p>
      </div>
    )
  }

  return (
    <div className="diff-viewer">
      <div
        ref={containerRef}
        className={`diff-container ${isDark ? 'd2h-dark-color-scheme' : ''}`}
        onMouseDown={handleMouseDown}
        tabIndex={0}
      />
    </div>
  )
}
