import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { DiffEditor, Editor } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import type { FileDiff } from '../../preload/index'
import { showToast } from './Toast'
import { isValidDataUri } from '../utils/diff-viewer'
import { getMonacoTheme, getLanguageForFile } from '../monaco-setup'

interface DiffViewerProps {
  diffs: FileDiff[]
  selectedFile: string | null
  viewMode?: 'diff' | 'show'
  fromVersion?: string
  toVersion?: string
}

const EDITOR_OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  readOnly: true,
  minimap: { enabled: false },
  lineNumbers: 'on',
  scrollBeyondLastLine: false,
  fontSize: 12,
  fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
  tabSize: 2,
  renderWhitespace: 'none',
  folding: true,
  glyphMargin: false,
  lineDecorationsWidth: 0,
  lineNumbersMinChars: 3,
  automaticLayout: true,
  wordWrap: 'off',
  contextmenu: false,
  scrollbar: {
    verticalScrollbarSize: 8,
    horizontalScrollbarSize: 8
  }
}

const DIFF_EDITOR_OPTIONS: editor.IDiffEditorConstructionOptions = {
  ...EDITOR_OPTIONS,
  renderSideBySide: true,
  renderSideBySideInlineBreakpoint: 0,
  useInlineViewWhenSpaceIsLimited: false,
  enableSplitViewResizing: true,
  ignoreTrimWhitespace: false,
  renderIndicators: true,
  renderMarginRevertIcon: false,
  hideUnchangedRegions: {
    enabled: true,
    contextLineCount: 3,
    minimumLineCount: 8,
    revealLineCount: 20
  },
  experimental: {
    showMoves: true
  }
}

export default function DiffViewer({
  diffs,
  selectedFile,
  viewMode = 'diff',
  fromVersion,
  toVersion
}: DiffViewerProps) {
  const [monacoTheme, setMonacoTheme] = useState(getMonacoTheme)
  const [copied, setCopied] = useState(false)
  const diffEditorRef = useRef<editor.IDiffEditor | null>(null)
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)

  const visibleDiff = useMemo(
    () => (selectedFile ? diffs.find((d) => d.filePath === selectedFile) : null),
    [diffs, selectedFile]
  )

  // Track theme changes
  useEffect(() => {
    const root = document.documentElement
    const updateTheme = (): void => setMonacoTheme(getMonacoTheme())
    updateTheme()

    const observer = new MutationObserver(updateTheme)
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  const handleCopyContent = useCallback(async () => {
    if (!visibleDiff) return
    const text = viewMode === 'show' ? (visibleDiff.newContent ?? visibleDiff.oldContent) : visibleDiff.unifiedDiff
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to copy to clipboard', 'error')
    }
  }, [visibleDiff, viewMode])

  const handleOpenInVSCode = useCallback(async () => {
    if (!visibleDiff || !fromVersion || !toVersion) return
    try {
      const result = await window.api.editor.openDiff({
        filePath: visibleDiff.filePath,
        fromVersion,
        toVersion,
        oldContent: visibleDiff.oldContent,
        newContent: visibleDiff.newContent
      })
      if (!result.success) {
        showToast(result.error || 'Failed to open VS Code', 'error')
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to open VS Code', 'error')
    }
  }, [visibleDiff, fromVersion, toVersion])

  const handleExpandAll = useCallback(() => {
    const diffEditor = diffEditorRef.current
    if (!diffEditor) return
    // Toggle hideUnchangedRegions off to reveal all regions
    diffEditor.updateOptions({
      hideUnchangedRegions: { enabled: false }
    })
  }, [])

  const handleDiffEditorMount = useCallback((editor: editor.IDiffEditor) => {
    diffEditorRef.current = editor
  }, [])

  const handleEditorMount = useCallback((editor: editor.IStandaloneCodeEditor) => {
    editorRef.current = editor
  }, [])

  if (diffs.length === 0) {
    return (
      <div className="diff-viewer-empty">
        <p>No differences found</p>
      </div>
    )
  }

  if (!selectedFile || !visibleDiff) {
    return (
      <div className="diff-viewer-empty">
        <p>Select a file to view</p>
      </div>
    )
  }

  // Image preview
  const isImage = visibleDiff.oldContent.startsWith('data:image/') || visibleDiff.newContent.startsWith('data:image/')
  const language = getLanguageForFile(selectedFile)
  const pathParts = selectedFile.split('/')

  return (
    <div className="diff-viewer">
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
          {viewMode === 'diff' && !isImage && (
            <button className="diff-action-btn" onClick={handleOpenInVSCode} title="Open in VS Code diff">
              VS Code
            </button>
          )}
          {viewMode === 'diff' && !isImage && (
            <button className="diff-action-btn" onClick={handleExpandAll} title="Expand all hidden regions">
              Expand All
            </button>
          )}
        </div>
      </div>

      <div className="diff-container">
        {isImage ? (
          renderImagePreview(visibleDiff)
        ) : viewMode === 'show' ? (
          <Editor
            language={language}
            value={visibleDiff.newContent ?? visibleDiff.oldContent}
            theme={monacoTheme}
            options={EDITOR_OPTIONS}
            onMount={handleEditorMount}
          />
        ) : visibleDiff.status === 'added' || visibleDiff.status === 'deleted' ? (
          <DiffEditor
            original={visibleDiff.oldContent}
            modified={visibleDiff.newContent}
            language={language}
            theme={monacoTheme}
            options={{ ...DIFF_EDITOR_OPTIONS, renderSideBySide: false }}
            onMount={handleDiffEditorMount}
          />
        ) : (
          <DiffEditor
            original={visibleDiff.oldContent}
            modified={visibleDiff.newContent}
            language={language}
            theme={monacoTheme}
            options={DIFF_EDITOR_OPTIONS}
            onMount={handleDiffEditorMount}
          />
        )}
      </div>
    </div>
  )
}

function renderImagePreview(diff: FileDiff) {
  const oldImg = diff.oldContent.startsWith('data:image/')
  const newImg = diff.newContent.startsWith('data:image/')

  if (diff.status === 'added' || diff.status === 'deleted') {
    const src = diff.status === 'added' ? diff.newContent : diff.oldContent
    if (!isValidDataUri(src)) {
      return <div className="media-preview">Invalid image data</div>
    }
    return (
      <div className="media-preview">
        <img src={src} />
      </div>
    )
  }

  // Modified — side by side
  const oldSafe = oldImg && isValidDataUri(diff.oldContent)
  const newSafe = newImg && isValidDataUri(diff.newContent)
  return (
    <div className="media-diff">
      <div className="media-diff-side">
        <div className="media-diff-label">Before</div>
        {oldSafe ? <img src={diff.oldContent} /> : <div className="media-diff-empty">Not an image</div>}
      </div>
      <div className="media-diff-side">
        <div className="media-diff-label">After</div>
        {newSafe ? <img src={diff.newContent} /> : <div className="media-diff-empty">Not an image</div>}
      </div>
    </div>
  )
}
