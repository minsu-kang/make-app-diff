import React from 'react'

type ComponentType = 'app' | 'account' | 'hook'

interface ComponentTabsProps {
  activeTab: ComponentType
  onTabChange: (tab: ComponentType) => void
  summaries: Record<ComponentType, { added: number; deleted: number; modified: number } | null>
}

export default function ComponentTabs({ activeTab, onTabChange, summaries }: ComponentTabsProps) {
  const tabs: { key: ComponentType; label: string }[] = [
    { key: 'app', label: 'App' },
    { key: 'account', label: 'Connection' },
    { key: 'hook', label: 'Webhook' }
  ]

  return (
    <div className="component-tabs">
      {tabs.map((tab) => {
        const summary = summaries[tab.key]
        const badge =
          summary && summary.added + summary.deleted + summary.modified > 0
            ? summary.added + summary.deleted + summary.modified
            : null

        return (
          <button
            key={tab.key}
            className={`tab-btn ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => onTabChange(tab.key)}
          >
            {tab.label}
            {badge !== null && <span className="tab-badge">{badge}</span>}
          </button>
        )
      })}
    </div>
  )
}
