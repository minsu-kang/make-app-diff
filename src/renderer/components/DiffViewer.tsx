import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import type { FileDiff } from '../../preload/index'
import { showToast } from './Toast'
import { html, parse } from 'diff2html'
import 'diff2html/bundles/css/diff2html.min.css'
import hljs from 'highlight.js/lib/core'
import json from 'highlight.js/lib/languages/json'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import hljsCss from 'highlight.js/lib/languages/css'
import xml from 'highlight.js/lib/languages/xml'
import markdown from 'highlight.js/lib/languages/markdown'

// Custom IMLJSON language — JSON with IML {{expressions}} and rpc:// refs
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function imljson(hljs: any) {
  const IML_MUSTACHE = {
    begin: /\{\{/,
    end: /\}\}/,
    className: 'template-tag',
    contains: [
      {
        className: 'built_in',
        match:
          /\b(?:item|body|connection|parameters|response|headers|temp|oauth|common|query|data|undefined|emptyarray|emptystring)\b/
      },
      {
        className: 'title function_',
        match: /\b\w+(?=\s*\()/
      },
      {
        className: 'string',
        begin: /'/,
        end: /'/
      }
    ]
  }

  const RPC_REF = {
    className: 'title function_',
    match: /rpc:\/\/\w+/
  }

  const ESCAPE = {
    className: 'char.escape',
    match: /\\(?:["\\/bfnrt{}]|u[0-9a-fA-F]{4})/
  }

  return {
    name: 'IMLJSON',
    contains: [
      hljs.C_LINE_COMMENT_MODE,
      hljs.C_BLOCK_COMMENT_MODE,
      {
        className: 'attr',
        begin: /"(?:\\.|[^\\"\r\n])*"(?=\s*:)/,
        contains: [ESCAPE]
      },
      {
        className: 'string',
        begin: /"/,
        end: /"/,
        illegal: /\n/,
        contains: [ESCAPE, IML_MUSTACHE, RPC_REF]
      },
      {
        className: 'number',
        match: /-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/
      },
      {
        className: 'literal',
        match: /\b(?:true|false|null)\b/
      },
      {
        className: 'punctuation',
        match: /[{}[\],]/
      }
    ]
  }
}

hljs.registerLanguage('json', json)
hljs.registerLanguage('imljson', imljson)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('css', hljsCss)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('markdown', markdown)

// Split highlighted HTML by newlines while preserving open <span> context
function splitHighlightedLines(html: string): string[] {
  const lines = html.split('\n')
  const result: string[] = []
  const openSpans: string[] = []

  for (const line of lines) {
    // Prepend any spans still open from previous lines
    const prefix = openSpans.join('')
    const output = prefix + line

    // Track open/close spans on this line
    const opens = line.match(/<span [^>]*>/g) || []
    const closes = line.match(/<\/span>/g) || []

    // Update the stack
    for (const tag of opens) openSpans.push(tag)
    for (let i = 0; i < closes.length; i++) openSpans.pop()

    // Close any still-open spans at end of this line
    const suffix = '</span>'.repeat(openSpans.length)
    result.push(output + suffix)
  }
  return result
}

const extToLang: Record<string, string> = {
  json: 'json',
  imljson: 'imljson',
  js: 'javascript',
  ts: 'typescript',
  css: 'css',
  html: 'xml',
  xml: 'xml',
  md: 'markdown'
}

// Apply pre-highlighted lines to a diff2html table by matching line numbers
function applyHighlightToTable(table: Element, highlightedLines: string[]): void {
  const rows = table.querySelectorAll('tbody tr')
  for (const row of rows) {
    const lineNumEl = row.querySelector('.d2h-code-side-linenumber, .d2h-code-linenumber')
    if (!lineNumEl) continue
    const lineNum = parseInt(lineNumEl.textContent?.trim().split(/\s+/).pop() || '0', 10)
    if (lineNum <= 0 || lineNum > highlightedLines.length) continue
    const lineCell = row.querySelector('.d2h-code-side-line')
    if (lineCell?.classList.contains('d2h-code-side-emptyplaceholder')) continue
    const ctn = row.querySelector('.d2h-code-line-ctn')
    if (!ctn || !ctn.textContent?.trim()) continue
    ctn.innerHTML = highlightedLines[lineNum - 1]
  }
}

// --- Search utilities ---

function clearMarks(container: HTMLElement): void {
  const marks = container.querySelectorAll('mark.diff-search-match')
  for (const mark of marks) {
    const parent = mark.parentNode
    if (!parent) continue
    while (mark.firstChild) {
      parent.insertBefore(mark.firstChild, mark)
    }
    parent.removeChild(mark)
  }
  container.normalize()
}

const skipClasses = ['d2h-code-side-linenumber', 'd2h-code-side-emptyplaceholder', 'code-line-num', 'diff-fold-btn']

function findAndMarkMatches(container: HTMLElement, query: string): HTMLElement[] {
  if (!query) return []

  const lowerQuery = query.toLowerCase()
  const matches: HTMLElement[] = []

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node: Node): number {
      let el = node.parentElement
      while (el && el !== container) {
        if (el.tagName === 'TR' && el.style.display === 'none') {
          return NodeFilter.FILTER_REJECT
        }
        for (const cls of skipClasses) {
          if (el.classList.contains(cls)) {
            return NodeFilter.FILTER_REJECT
          }
        }
        el = el.parentElement
      }
      return NodeFilter.FILTER_ACCEPT
    }
  })

  const textNodes: Text[] = []
  let current: Node | null
  while ((current = walker.nextNode())) {
    textNodes.push(current as Text)
  }

  for (const textNode of textNodes) {
    const text = textNode.textContent || ''
    const lowerText = text.toLowerCase()
    let searchFrom = 0
    const indices: number[] = []

    while (true) {
      const idx = lowerText.indexOf(lowerQuery, searchFrom)
      if (idx === -1) break
      indices.push(idx)
      searchFrom = idx + 1
    }

    if (indices.length === 0) continue

    let currentNode: Text = textNode
    let offset = 0

    for (const idx of indices) {
      const relIdx = idx - offset
      if (relIdx < 0 || relIdx > (currentNode.textContent?.length || 0)) continue

      const matchStart = currentNode.splitText(relIdx)
      const after = matchStart.splitText(lowerQuery.length)

      const mark = document.createElement('mark')
      mark.className = 'diff-search-match'
      matchStart.parentNode!.insertBefore(mark, matchStart)
      mark.appendChild(matchStart)

      matches.push(mark)
      currentNode = after
      offset = idx + lowerQuery.length
    }
  }

  return matches
}

// --- JSON path annotation ---

function buildJsonPathMap(content: string): Map<number, string> {
  const pathMap = new Map<number, string>()
  try {
    JSON.parse(content)
  } catch {
    return pathMap
  }

  const lines = content.split('\n')
  const stack: { segment: string; isArray: boolean; index: number }[] = []

  const currentPath = (): string =>
    stack
      .map((s) => s.segment)
      .filter(Boolean)
      .join('.')
      .replace(/\.\[/g, '[')

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()

    // Closing brace/bracket — pop before recording
    if (trimmed.startsWith('}') || trimmed.startsWith(']')) {
      if (stack.length > 0) stack.pop()
      pathMap.set(i + 1, currentPath())
      continue
    }

    // "key": { — named object container (skip self-contained "key": {})
    const objMatch = trimmed.match(/^"([^"]+)"\s*:\s*\{/)
    if (objMatch && !trimmed.includes('}')) {
      stack.push({ segment: objMatch[1], isArray: false, index: 0 })
      pathMap.set(i + 1, currentPath())
      continue
    }

    // "key": [ — named array container (skip self-contained "key": [])
    const arrMatch = trimmed.match(/^"([^"]+)"\s*:\s*\[/)
    if (arrMatch && !trimmed.includes(']')) {
      stack.push({ segment: arrMatch[1], isArray: true, index: 0 })
      pathMap.set(i + 1, currentPath())
      continue
    }

    // Bare { — array element
    if (trimmed === '{') {
      const parent = stack.length > 0 ? stack[stack.length - 1] : null
      if (parent?.isArray) {
        stack.push({ segment: `[${parent.index}]`, isArray: false, index: 0 })
        parent.index++
      } else {
        stack.push({ segment: '', isArray: false, index: 0 })
      }
      pathMap.set(i + 1, currentPath())
      continue
    }

    // Bare [ — anonymous array
    if (trimmed === '[') {
      stack.push({ segment: '', isArray: true, index: 0 })
      pathMap.set(i + 1, currentPath())
      continue
    }

    // Regular content line
    pathMap.set(i + 1, currentPath())
  }

  return pathMap
}

function annotateJsonPaths(container: HTMLElement, fileName: string, oldContent: string, newContent: string): void {
  const ext = fileName.split('.').pop()?.toLowerCase()
  if (ext !== 'json' && ext !== 'imljson') return

  const oldPathMap = buildJsonPathMap(oldContent)
  const newPathMap = buildJsonPathMap(newContent)
  if (oldPathMap.size === 0 && newPathMap.size === 0) return

  const tables = container.querySelectorAll('.d2h-diff-table')
  for (let t = 0; t < tables.length; t++) {
    const table = tables[t]
    const tbody = table.querySelector('tbody')
    if (!tbody) continue

    // side-by-side: table 0 = left (old), table 1 = right (new)
    // line-by-line: single table, use new path map
    const pathMap = tables.length === 2 ? (t === 0 ? oldPathMap : newPathMap) : newPathMap

    const rows = Array.from(tbody.querySelectorAll('tr'))
    let lastAnnotatedPath = ''
    let inChangeBlock = false

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      if (row.querySelector('.diff-fold-btn') || row.classList.contains('json-path-annotation')) continue

      const isChange = row.querySelector('.d2h-ins, .d2h-del') !== null
      const isContext = row.querySelector('.d2h-cntx') !== null

      if (isChange && !inChangeBlock) {
        inChangeBlock = true

        // Get file line number from DOM
        const lineNumCell = row.querySelector('.d2h-code-side-linenumber, .d2h-code-linenumber')
        const lineNum = parseInt(lineNumCell?.textContent?.trim() || '0', 10)
        const path = lineNum > 0 ? pathMap.get(lineNum) || '' : ''

        if (path && path !== lastAnnotatedPath) {
          lastAnnotatedPath = path
          const annotationRow = document.createElement('tr')
          annotationRow.className = 'json-path-annotation'
          const td = document.createElement('td')
          td.colSpan = 20
          td.textContent = `@ ${path}`
          annotationRow.appendChild(td)
          row.before(annotationRow)
        }
      } else if (!isChange && isContext) {
        inChangeBlock = false
      }
    }
  }
}

function isValidDataUri(uri: string): boolean {
  return /^data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+$/.test(uri)
}

interface DiffViewerProps {
  diffs: FileDiff[]
  selectedFile: string | null
  viewMode?: 'diff' | 'show'
  fromVersion?: string
  toVersion?: string
}

export default function DiffViewer({
  diffs,
  selectedFile,
  viewMode = 'diff',
  fromVersion,
  toVersion
}: DiffViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDark, setIsDark] = useState(true)
  const activeSideRef = useRef<'left' | 'right' | null>(null)
  const scrollPositionsRef = useRef<Map<string, number>>(new Map())
  const prevFileRef = useRef<string | null>(null)

  // Search state
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [matchCount, setMatchCount] = useState(0)
  const [currentMatch, setCurrentMatch] = useState(-1)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const matchElementsRef = useRef<HTMLElement[]>([])
  const [copied, setCopied] = useState(false)

  const visibleDiffs = useMemo(
    () => (selectedFile ? diffs.filter((d) => d.filePath === selectedFile) : diffs),
    [diffs, selectedFile]
  )

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

      // If selection is within a single row, let the browser handle it natively
      const range = sel.getRangeAt(0)
      const startRow = (
        range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement
      )?.closest('tr')
      const endRow = (
        range.endContainer instanceof Element ? range.endContainer : range.endContainer.parentElement
      )?.closest('tr')
      if (startRow && startRow === endRow) return

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

      // Multi-row selection: collect code lines, skipping empty placeholders
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

  // Save/restore scroll positions when switching files
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Save scroll position for previous file
    if (prevFileRef.current) {
      const scrollEl = (container.querySelector('.d2h-file-side-diff') as HTMLElement) || container
      scrollPositionsRef.current.set(prevFileRef.current, scrollEl.scrollTop)
    }

    prevFileRef.current = selectedFile

    // Restore scroll position for new file (after render)
    if (selectedFile) {
      requestAnimationFrame(() => {
        const savedPos = scrollPositionsRef.current.get(selectedFile)
        if (savedPos !== undefined) {
          const scrollEl = (container.querySelector('.d2h-file-side-diff') as HTMLElement) || container
          scrollEl.scrollTop = savedPos
        }
      })
    }
  }, [selectedFile])

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

  // Cmd+F to open search
  useEffect(() => {
    const handleCmdF = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        if (diffs.length > 0 && selectedFile) {
          e.preventDefault()
          setSearchOpen(true)
        }
      }
    }
    window.addEventListener('keydown', handleCmdF)
    return () => window.removeEventListener('keydown', handleCmdF)
  }, [diffs.length, selectedFile])

  // Auto-focus search input + cleanup on close
  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      searchInputRef.current.focus()
      const sel = window.getSelection()
      const selectedText = sel?.toString().trim()
      if (selectedText && selectedText.length < 100 && !selectedText.includes('\n')) {
        setSearchQuery(selectedText)
        searchInputRef.current.select()
      }
    }
    if (!searchOpen) {
      if (containerRef.current) {
        clearMarks(containerRef.current)
      }
      matchElementsRef.current = []
      setMatchCount(0)
      setCurrentMatch(-1)
    }
  }, [searchOpen])

  // Debounced search execution
  useEffect(() => {
    if (!searchOpen || !containerRef.current) return

    const timer = setTimeout(() => {
      const container = containerRef.current
      if (!container) return
      clearMarks(container)
      const matches = findAndMarkMatches(container, searchQuery)
      matchElementsRef.current = matches
      setMatchCount(matches.length)
      setCurrentMatch(matches.length > 0 ? 0 : -1)
    }, 150)

    return () => clearTimeout(timer)
  }, [searchQuery, searchOpen])

  useEffect(() => {
    if (!containerRef.current || visibleDiffs.length === 0) return

    if (viewMode === 'show') {
      // Plain code view with syntax highlighting
      const lines = visibleDiffs
        .map((d) => {
          const content = d.newContent || d.oldContent
          if (content.startsWith('data:image/')) {
            if (!isValidDataUri(content)) return '<div class="media-preview">Invalid image data</div>'
            return `<div class="media-preview"><img src="${content}" /></div>`
          }
          const ext = d.filePath.split('.').pop()?.toLowerCase() || ''
          const lang = extToLang[ext]
          let highlighted: string
          if (lang) {
            highlighted = hljs.highlight(content, { language: lang }).value
          } else {
            highlighted = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          }
          const numberedLines = splitHighlightedLines(highlighted).map((line, i) => {
            return `<tr><td class="code-line-num">${i + 1}</td><td class="code-line-content"><pre>${line}</pre></td></tr>`
          })
          return `<table class="code-viewer"><tbody>${numberedLines.join('')}</tbody></table>`
        })
        .join('')
      containerRef.current.innerHTML = lines

      // Code folding for show mode
      const tables = containerRef.current.querySelectorAll('.code-viewer')
      for (const table of tables) {
        const allRows = Array.from(table.querySelectorAll('tr'))
        const rawLines = visibleDiffs.map((d) => (d.newContent || d.oldContent).split('\n')).flat()

        // Find foldable ranges: lines ending with { or [
        const foldRanges: { start: number; end: number }[] = []
        const stack: number[] = []

        for (let i = 0; i < rawLines.length; i++) {
          const trimmed = rawLines[i].trimEnd()
          if (trimmed.endsWith('{') || trimmed.endsWith('[')) {
            stack.push(i)
          } else {
            const first = trimmed.trimStart().charAt(0)
            if (first === '}' || first === ']') {
              if (stack.length > 0) {
                const start = stack.pop()!
                if (i - start > 1) {
                  foldRanges.push({ start, end: i })
                }
              }
            }
          }
        }

        // Add fold indicators
        for (const { start, end } of foldRanges) {
          const numCell = allRows[start]?.querySelector('.code-line-num')
          if (!numCell) continue

          const innerRows = allRows.slice(start + 1, end)
          const indicator = document.createElement('span')
          indicator.className = 'code-fold-indicator'
          indicator.textContent = '\u25BE'
          let folded = false

          indicator.addEventListener('click', (e) => {
            e.stopPropagation()
            folded = !folded
            indicator.textContent = folded ? '\u25B8' : '\u25BE'
            indicator.classList.toggle('folded', folded)
            for (const row of innerRows) {
              ;(row as HTMLElement).style.display = folded ? 'none' : ''
            }
            // Show summary on the fold line when collapsed
            const contentCell = allRows[start]?.querySelector('.code-line-content pre')
            if (!contentCell) return
            if (folded) {
              const origHtml = contentCell.getAttribute('data-orig') || contentCell.innerHTML
              contentCell.setAttribute('data-orig', origHtml)
              const lineCount = innerRows.length
              contentCell.innerHTML = `${origHtml} <span class="code-fold-summary">... ${lineCount} lines</span>`
            } else {
              const origHtml = contentCell.getAttribute('data-orig')
              if (origHtml) contentCell.innerHTML = origHtml
            }
          })

          numCell.classList.add('code-line-foldable')
          numCell.appendChild(indicator)
        }
      }
      return
    }

    // Binary image files — show preview instead of diff
    const isBinaryView =
      visibleDiffs.length === 1 &&
      (visibleDiffs[0].oldContent.startsWith('data:image/') || visibleDiffs[0].newContent.startsWith('data:image/'))

    if (isBinaryView) {
      const d = visibleDiffs[0]
      const oldImg = d.oldContent.startsWith('data:image/')
      const newImg = d.newContent.startsWith('data:image/')

      if (d.status === 'added' || d.status === 'deleted') {
        const src = d.status === 'added' ? d.newContent : d.oldContent
        if (!isValidDataUri(src)) {
          containerRef.current.innerHTML = '<div class="media-preview">Invalid image data</div>'
        } else {
          containerRef.current.innerHTML = `<div class="media-preview"><img src="${src}" /></div>`
        }
      } else {
        // Modified — side by side
        const oldSafe = oldImg && isValidDataUri(d.oldContent)
        const newSafe = newImg && isValidDataUri(d.newContent)
        containerRef.current.innerHTML = `<div class="media-diff">
          <div class="media-diff-side">
            <div class="media-diff-label">Before</div>
            ${oldSafe ? `<img src="${d.oldContent}" />` : '<div class="media-diff-empty">Not an image</div>'}
          </div>
          <div class="media-diff-side">
            <div class="media-diff-label">After</div>
            ${newSafe ? `<img src="${d.newContent}" />` : '<div class="media-diff-empty">Not an image</div>'}
          </div>
        </div>`
      }
      return
    }

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

    const fileWrappers = containerRef.current.querySelectorAll('.d2h-file-wrapper')

    // Sync scrolling between left and right side-by-side panels
    let scrollCleanup: (() => void) | null = null
    const sides = containerRef.current.querySelectorAll('.d2h-file-side-diff') as NodeListOf<HTMLElement>
    if (sides.length === 2) {
      let syncing = false
      const syncHandler0 = (): void => {
        if (syncing) return
        syncing = true
        sides[1].scrollTop = sides[0].scrollTop
        sides[1].scrollLeft = sides[0].scrollLeft
        syncing = false
      }
      const syncHandler1 = (): void => {
        if (syncing) return
        syncing = true
        sides[0].scrollTop = sides[1].scrollTop
        sides[0].scrollLeft = sides[1].scrollLeft
        syncing = false
      }
      sides[0].addEventListener('scroll', syncHandler0)
      sides[1].addEventListener('scroll', syncHandler1)
      scrollCleanup = () => {
        sides[0].removeEventListener('scroll', syncHandler0)
        sides[1].removeEventListener('scroll', syncHandler1)
      }
    }

    // Deferred post-processing to avoid blocking the main thread
    let cancelled = false

    // Phase 1: Syntax highlighting (pre-highlight entire content at once, not per-line)
    requestAnimationFrame(() => {
      if (cancelled) return

      for (const wrapper of fileWrappers) {
        const nameEl = wrapper.querySelector('.d2h-file-name')
        const fileName = nameEl?.textContent?.trim()?.replace(/^[ab]\//, '') || ''
        const ext = fileName.split('.').pop()?.toLowerCase() || ''
        const lang = extToLang[ext]
        if (!lang) continue

        const diff = visibleDiffs.find((d) => d.filePath === fileName)
        if (!diff) continue

        const tables = wrapper.querySelectorAll('.d2h-diff-table')
        if (tables.length === 2) {
          // Side-by-side: left=old, right=new — 2 highlight calls instead of N per-line
          if (diff.oldContent && !diff.oldContent.startsWith('data:')) {
            try {
              const oldLines = splitHighlightedLines(
                hljs.highlight(diff.oldContent, { language: lang, ignoreIllegals: true }).value
              )
              applyHighlightToTable(tables[0], oldLines)
            } catch {
              /* skip */
            }
          }
          if (diff.newContent && !diff.newContent.startsWith('data:')) {
            try {
              const newLines = splitHighlightedLines(
                hljs.highlight(diff.newContent, { language: lang, ignoreIllegals: true }).value
              )
              applyHighlightToTable(tables[1], newLines)
            } catch {
              /* skip */
            }
          }
        } else if (tables.length === 1) {
          // Line-by-line (unified)
          const content = diff.newContent || diff.oldContent
          if (content && !content.startsWith('data:')) {
            try {
              const lines = splitHighlightedLines(
                hljs.highlight(content, { language: lang, ignoreIllegals: true }).value
              )
              applyHighlightToTable(tables[0], lines)
            } catch {
              /* skip */
            }
          }
        }
      }

      // Phase 2: Collapse, fold, annotate
      requestAnimationFrame(() => {
        if (cancelled) return

        // Collapse long runs of unchanged lines
        const allTables = containerRef.current!.querySelectorAll('.d2h-diff-table')
        for (const table of allTables) {
          const tbody = table.querySelector('tbody')
          if (!tbody) continue

          const rows = Array.from(tbody.querySelectorAll('tr'))
          const CONTEXT_LINES = 3
          const MIN_FOLD = 8

          let runStart = -1
          const runs: { start: number; end: number }[] = []

          for (let i = 0; i <= rows.length; i++) {
            const isContext = i < rows.length && rows[i].querySelector('.d2h-cntx') !== null
            if (isContext) {
              if (runStart === -1) runStart = i
            } else {
              if (runStart !== -1) {
                if (i - runStart > MIN_FOLD) runs.push({ start: runStart, end: i })
                runStart = -1
              }
            }
          }

          for (let r = runs.length - 1; r >= 0; r--) {
            const { start, end } = runs[r]
            const hideStart = start + CONTEXT_LINES
            const hideEnd = end - CONTEXT_LINES
            if (hideStart >= hideEnd) continue

            const hiddenRows = rows.slice(hideStart, hideEnd)
            const hiddenCount = hiddenRows.length

            const placeholderRow = document.createElement('tr')
            const placeholderCell = document.createElement('td')
            placeholderCell.colSpan = 20
            const btn = document.createElement('button')
            btn.className = 'diff-fold-btn'
            btn.textContent = `\u25B8 Show ${hiddenCount} hidden lines`
            btn.addEventListener('click', () => {
              for (const row of hiddenRows) row.style.display = ''
              placeholderRow.remove()
            })
            placeholderCell.appendChild(btn)
            placeholderRow.appendChild(placeholderCell)

            for (const row of hiddenRows) row.style.display = 'none'
            rows[hideStart].before(placeholderRow)
          }
        }

        // Code folding for diff mode — indicator in code content cell
        for (const wrapper of fileWrappers) {
          const sideDiffs = wrapper.querySelectorAll('.d2h-file-side-diff')
          const targetSide = sideDiffs.length === 2 ? sideDiffs[1] : wrapper
          const diffTable = targetSide.querySelector('.d2h-diff-table')
          if (!diffTable) continue

          const allRows = Array.from(diffTable.querySelectorAll('tbody tr'))
          const foldRanges: { start: number; end: number }[] = []
          const foldStack: number[] = []

          for (let i = 0; i < allRows.length; i++) {
            const row = allRows[i]
            if ((row as HTMLElement).style.display === 'none' || row.querySelector('.diff-fold-btn')) continue
            const ctn = row.querySelector('.d2h-code-line-ctn')
            if (!ctn) continue
            const text = ctn.textContent || ''
            const trimmed = text.trimEnd()
            if (trimmed.endsWith('{') || trimmed.endsWith('[')) {
              foldStack.push(i)
            } else {
              const first = trimmed.trimStart().charAt(0)
              if (first === '}' || first === ']') {
                if (foldStack.length > 0) {
                  const s = foldStack.pop()!
                  if (i - s > 1) foldRanges.push({ start: s, end: i })
                }
              }
            }
          }

          const allRowsLeft =
            sideDiffs.length === 2 ? Array.from(sideDiffs[0].querySelectorAll('.d2h-diff-table tbody tr')) : null

          for (const { start, end } of foldRanges) {
            const row = allRows[start]
            if (!row) continue
            // Prepend indicator inside code line content (inline, always visible)
            const ctn = row.querySelector('.d2h-code-line-ctn')
            if (!ctn) continue

            const innerRows = allRows.slice(start + 1, end)
            const innerRowsLeft = allRowsLeft ? allRowsLeft.slice(start + 1, end) : null

            const indicator = document.createElement('span')
            indicator.className = 'diff-fold-indicator'
            indicator.textContent = '\u25BE '
            let folded = false

            indicator.addEventListener('click', (e) => {
              e.stopPropagation()
              folded = !folded
              indicator.textContent = folded ? '\u25B8 ' : '\u25BE '
              indicator.classList.toggle('folded', folded)
              for (const r of innerRows) {
                ;(r as HTMLElement).style.display = folded ? 'none' : ''
              }
              if (innerRowsLeft) {
                for (const r of innerRowsLeft) {
                  ;(r as HTMLElement).style.display = folded ? 'none' : ''
                }
              }
            })

            ctn.prepend(indicator)
          }
        }

        // JSON path annotation
        for (const wrapper of fileWrappers) {
          const nameEl = wrapper.querySelector('.d2h-file-name')
          const fileName = nameEl?.textContent?.trim()?.replace(/^[ab]\//, '') || ''
          const diff = visibleDiffs.find((d) => d.filePath === fileName)
          if (diff) {
            annotateJsonPaths(wrapper as HTMLElement, fileName, diff.oldContent, diff.newContent)
          }
        }
      })
    })

    return () => {
      cancelled = true
      if (scrollCleanup) scrollCleanup()
    }
  }, [visibleDiffs, viewMode])

  // Re-search when diff content changes (after innerHTML is set by rendering effect)
  useEffect(() => {
    if (!searchOpen || !searchQuery || !containerRef.current) return
    requestAnimationFrame(() => {
      const container = containerRef.current
      if (!container) return
      clearMarks(container)
      const matches = findAndMarkMatches(container, searchQuery)
      matchElementsRef.current = matches
      setMatchCount(matches.length)
      setCurrentMatch(matches.length > 0 ? 0 : -1)
    })
  }, [diffs, selectedFile, viewMode])

  // Navigate to current match
  useEffect(() => {
    const matches = matchElementsRef.current
    for (const m of matches) {
      m.classList.remove('diff-search-current')
    }
    if (currentMatch >= 0 && currentMatch < matches.length) {
      matches[currentMatch].classList.add('diff-search-current')
      matches[currentMatch].scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [currentMatch])

  const goToNextMatch = useCallback(() => {
    setCurrentMatch((prev) => {
      const count = matchElementsRef.current.length
      if (count === 0) return -1
      return (prev + 1) % count
    })
  }, [])

  const goToPrevMatch = useCallback(() => {
    setCurrentMatch((prev) => {
      const count = matchElementsRef.current.length
      if (count === 0) return -1
      return (prev - 1 + count) % count
    })
  }, [])

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        if (e.shiftKey) {
          goToPrevMatch()
        } else {
          goToNextMatch()
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setSearchOpen(false)
      }
    },
    [goToNextMatch, goToPrevMatch]
  )

  const handleCopyContent = useCallback(async () => {
    if (visibleDiffs.length === 0) return
    const diff = visibleDiffs[0]
    const text = viewMode === 'show' ? diff.newContent || diff.oldContent : diff.unifiedDiff
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      showToast('Failed to copy to clipboard', 'error')
    }
  }, [visibleDiffs, viewMode])

  const handleOpenInVSCode = useCallback(async () => {
    if (visibleDiffs.length === 0 || !fromVersion || !toVersion) return
    const diff = visibleDiffs[0]
    try {
      const result = await window.api.editor.openDiff({
        filePath: diff.filePath,
        fromVersion,
        toVersion,
        oldContent: diff.oldContent,
        newContent: diff.newContent
      })
      if (!result.success) {
        showToast(result.error || 'Failed to open VS Code', 'error')
      }
    } catch {
      showToast('Failed to open VS Code', 'error')
    }
  }, [visibleDiffs, fromVersion, toVersion])

  const handleExpandAll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    // Click all remaining fold buttons to expand hidden lines
    const foldBtns = el.querySelectorAll('.diff-fold-btn') as NodeListOf<HTMLButtonElement>
    for (const btn of foldBtns) btn.click()
  }, [])

  if (diffs.length === 0) {
    return (
      <div className="diff-viewer-empty">
        <p>No differences found</p>
      </div>
    )
  }

  if (!selectedFile) {
    return (
      <div className="diff-viewer-empty">
        <p>Select a file to view</p>
      </div>
    )
  }

  const pathParts = selectedFile ? selectedFile.split('/') : []

  return (
    <div className="diff-viewer">
      {selectedFile && (
        <div className="diff-file-path">
          {pathParts.map((part, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span className="diff-file-path-sep">/</span>}
              <span className={i === pathParts.length - 1 ? 'diff-file-path-name' : ''}>{part}</span>
            </React.Fragment>
          ))}
          <div className="diff-file-actions">
            <button
              className={`diff-action-btn ${copied ? 'copied' : ''}`}
              onClick={handleCopyContent}
              title={viewMode === 'show' ? 'Copy file content' : 'Copy unified diff'}
            >
              {copied ? '\u2713' : 'Copy'}
            </button>
            {viewMode === 'diff' && (
              <button className="diff-action-btn" onClick={handleOpenInVSCode} title="Open in VS Code diff">
                VS Code
              </button>
            )}
            {viewMode === 'diff' && (
              <button className="diff-action-btn" onClick={handleExpandAll} title="Expand all hidden lines">
                Expand All
              </button>
            )}
          </div>
        </div>
      )}
      {searchOpen && (
        <div className="diff-search-bar">
          <input
            ref={searchInputRef}
            className="diff-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Find..."
            spellCheck={false}
          />
          <span className="diff-search-count">
            {searchQuery ? (matchCount > 0 ? `${currentMatch + 1} of ${matchCount}` : 'No results') : ''}
          </span>
          <button className="diff-search-btn" onClick={goToPrevMatch} title="Previous (Shift+Enter)">
            &#x25B2;
          </button>
          <button className="diff-search-btn" onClick={goToNextMatch} title="Next (Enter)">
            &#x25BC;
          </button>
          <button className="diff-search-btn" onClick={() => setSearchOpen(false)} title="Close (Esc)">
            &#x2715;
          </button>
        </div>
      )}
      <div
        ref={containerRef}
        className={`diff-container ${isDark ? 'd2h-dark-color-scheme' : ''}`}
        onMouseDown={handleMouseDown}
        tabIndex={0}
      />
    </div>
  )
}
