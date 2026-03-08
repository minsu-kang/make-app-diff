import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import type { FileDiff } from '../../preload/index'
import { buildTree, buildFlatList } from '../utils/file-tree'

interface FileTreeProps {
  diffs: FileDiff[]
  selectedFile: string | null
  onFileSelect: (filePath: string) => void
  appName?: string
  fromVersion?: string
  toVersion?: string
  viewMode?: 'diff' | 'show'
}

const statusColors: Record<string, string> = {
  added: '#2ea043',
  deleted: '#f85149',
  modified: '#d29922'
}

const folderIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M1.5 2.5h4l1 1.5H14.5v9h-13z" fill="#c09553" opacity="0.9" />
  </svg>
)

const folderOpenIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M1.5 2.5h4l1 1.5H14.5v2H4.5l-3 6v-9.5z" fill="#c09553" opacity="0.9" />
    <path d="M3 6h11.5l-3 7H1.5z" fill="#dcb67a" opacity="0.9" />
  </svg>
)

function fileBase(color: string, letter?: string): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3 1.5h6.5L13 5v9.5H3z" fill={color} fillOpacity="0.15" stroke={color} strokeOpacity="0.6" />
      <path d="M9.5 1.5V5H13" fill="none" stroke={color} strokeOpacity="0.6" />
      {letter && (
        <text x="8" y="12" textAnchor="middle" fontSize="6" fontWeight="700" fill={color}>
          {letter}
        </text>
      )}
    </svg>
  )
}

const fileIcons: Record<string, React.ReactElement> = {
  json: fileBase('#e6c84c', '{ }'),
  imljson: fileBase('#e6c84c', '{ }'),
  js: fileBase('#e8d44d', 'JS'),
  ts: fileBase('#3178c6', 'TS'),
  md: fileBase('#519aba', 'M'),
  css: fileBase('#56b3b4', '#'),
  html: fileBase('#e44d26', '<>'),
  png: fileBase('#a074c4', 'P'),
  svg: fileBase('#e6a23c', 'S'),
  txt: fileBase('#8a8a8a')
}

const defaultFileIcon = fileBase('#8a8a8a')

function getFileIcon(name: string): React.ReactElement {
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
  return fileIcons[ext] || defaultFileIcon
}

export default function FileTree({
  diffs,
  selectedFile,
  onFileSelect,
  appName,
  fromVersion,
  toVersion,
  viewMode = 'diff'
}: FileTreeProps) {
  const [panelWidth, setPanelWidth] = useState(280)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const isResizing = useRef(false)

  const tree = useMemo(() => buildTree(diffs), [diffs])

  useEffect(() => {
    setExpandedFolders(new Set())
  }, [diffs])

  const flatItems = useMemo(() => buildFlatList(tree, expandedFolders), [tree, expandedFolders])

  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        for (const p of next) {
          if (p === path || p.startsWith(path + '/')) next.delete(p)
        }
      } else {
        next.add(path)
      }
      return next
    })
  }, [])

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      isResizing.current = true
      const startX = e.clientX
      const startWidth = panelWidth

      const onMouseMove = (ev: MouseEvent): void => {
        if (!isResizing.current) return
        setPanelWidth(Math.max(180, Math.min(600, startWidth + (ev.clientX - startX))))
      }
      const onMouseUp = (): void => {
        isResizing.current = false
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    },
    [panelWidth]
  )

  if (diffs.length === 0) {
    return <div className="file-tree-empty">No changes</div>
  }

  return (
    <div className="file-tree" style={{ width: panelWidth }}>
      {viewMode === 'diff' && appName && fromVersion && toVersion && (
        <div className="file-tree-info">
          <span className="file-tree-app-name">{appName}</span>
          <span className="file-tree-versions">
            {fromVersion} → {toVersion}
          </span>
        </div>
      )}
      <div className="file-tree-header">
        {viewMode === 'show' ? 'Files' : 'Changed files'} ({diffs.length})
      </div>
      <ul className="file-list">
        {flatItems.map((item) => {
          const isSelected = !item.isFolder && item.diff && selectedFile === item.diff.filePath

          return (
            <li
              key={item.key}
              className={`tree-item ${isSelected ? 'selected' : ''}`}
              onClick={() => {
                if (item.isFolder) toggleFolder(item.fullPath)
                else if (item.diff) onFileSelect(item.diff.filePath)
              }}
            >
              {/* Indent guides */}
              <span className="tree-indent" style={{ width: item.depth * 16 }}>
                {Array.from({ length: item.depth }, (_, i) => (
                  <span key={i} className="indent-guide" style={{ left: i * 16 + 7 }} />
                ))}
              </span>
              {/* Row content */}
              {item.isFolder ? (
                <>
                  <span className={`tree-chevron ${item.isExpanded ? 'expanded' : ''}`} />
                  <span className="tree-icon-svg">{item.isExpanded ? folderOpenIcon : folderIcon}</span>
                  <span
                    className="tree-label folder"
                    style={item.folderStatus ? { color: statusColors[item.folderStatus] } : undefined}
                  >
                    {item.name}
                  </span>
                  <span className="tree-badge">{item.fileCount}</span>
                </>
              ) : (
                <>
                  <span className="tree-icon-spacer" />
                  <span className="tree-icon-svg">{getFileIcon(item.name)}</span>
                  <span className="tree-label" style={{ color: statusColors[item.diff!.status] }}>
                    {item.name}
                  </span>
                </>
              )}
            </li>
          )
        })}
      </ul>
      <div className="file-tree-resize" onMouseDown={handleMouseDown} />
    </div>
  )
}
