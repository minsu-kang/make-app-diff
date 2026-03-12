import React from 'react'

type ComponentType = 'app' | 'account' | 'hook'

interface ComponentTabsProps {
  activeTab: ComponentType
  onTabChange: (tab: ComponentType) => void
  summaries: Record<ComponentType, { added: number; deleted: number; modified: number } | null>
  isCustomApp?: boolean
  decompile?: boolean
  onDecompileToggle?: () => void
  onOpenVscode?: () => void
}

export default function ComponentTabs({
  activeTab,
  onTabChange,
  summaries,
  isCustomApp,
  decompile,
  onDecompileToggle,
  onOpenVscode
}: ComponentTabsProps) {
  const tabs: { key: ComponentType; label: string }[] = [
    { key: 'app', label: 'App' },
    { key: 'account', label: 'Connection' },
    { key: 'hook', label: 'Webhook' }
  ]

  return (
    <div className="component-tabs">
      {tabs.map((tab) => {
        const summary = summaries[tab.key]
        const hasChanges = summary && summary.added + summary.deleted + summary.modified > 0

        return (
          <button
            key={tab.key}
            className={`tab-btn ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => onTabChange(tab.key)}
          >
            {tab.label}
            {hasChanges && (
              <span className="tab-badges">
                {summary.added > 0 && <span className="tab-badge-add">+{summary.added}</span>}
                {summary.deleted > 0 && <span className="tab-badge-del">-{summary.deleted}</span>}
                {summary.modified > 0 && <span className="tab-badge-mod">~{summary.modified}</span>}
              </span>
            )}
          </button>
        )
      })}
      {onOpenVscode && (
        <button
          className="btn-decompile-toggle"
          onClick={onOpenVscode}
          title="Open in VS Code"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path
              d="M10.5 1.5L14 3.5v9l-3.5 2L2 9l2-1.5M10.5 1.5L6 5.5M10.5 1.5v11.5M2 9l4-3.5M2 9l4.5 2.5L10.5 13M6 5.5l4.5 2v5.5"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinejoin="round"
            />
          </svg>
          <span className="btn-decompile-label">VSCode</span>
        </button>
      )}
      {isCustomApp && onDecompileToggle && (
        <button
          className={`btn-decompile-toggle ${decompile ? 'active' : ''}`}
          onClick={onDecompileToggle}
          title={decompile ? 'Switch to raw compiled view' : 'Switch to SDK decompiled view'}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path
              d="M5.5 3L1 8l4.5 5M10.5 3L15 8l-4.5 5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="btn-decompile-label">{decompile ? 'SDK' : 'Raw'}</span>
        </button>
      )}
    </div>
  )
}
