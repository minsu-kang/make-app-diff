import MakeLogo from '../shared/ui/MakeLogo'
import './EmptyState.css'

export default function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        <svg width="80" height="80" viewBox="0 0 512 512" fill="none">
          <rect width="512" height="512" rx="108" fill="var(--accent-primary)" opacity="0.15" />
          <g transform="translate(80, 80)">
            <rect x="0" y="20" width="200" height="260" rx="16" fill="currentColor" opacity="0.1" />
            <rect x="24" y="52" width="120" height="8" rx="4" fill="currentColor" opacity="0.15" />
            <rect x="24" y="72" width="152" height="8" rx="4" fill="currentColor" opacity="0.15" />
            <rect x="24" y="92" width="100" height="8" rx="4" fill="currentColor" opacity="0.15" />
            <rect x="24" y="122" width="140" height="8" rx="4" fill="#f85149" opacity="0.5" />
            <rect x="24" y="142" width="110" height="8" rx="4" fill="#f85149" opacity="0.5" />
            <rect x="24" y="172" width="130" height="8" rx="4" fill="currentColor" opacity="0.15" />
            <rect x="24" y="192" width="90" height="8" rx="4" fill="currentColor" opacity="0.15" />
          </g>
          <g transform="translate(232, 152)">
            <rect x="0" y="0" width="200" height="260" rx="16" fill="currentColor" opacity="0.15" />
            <rect x="24" y="32" width="120" height="8" rx="4" fill="currentColor" opacity="0.15" />
            <rect x="24" y="52" width="152" height="8" rx="4" fill="currentColor" opacity="0.15" />
            <rect x="24" y="72" width="100" height="8" rx="4" fill="currentColor" opacity="0.15" />
            <rect x="24" y="102" width="140" height="8" rx="4" fill="#2ea043" opacity="0.6" />
            <rect x="24" y="122" width="125" height="8" rx="4" fill="#2ea043" opacity="0.6" />
            <rect x="24" y="142" width="90" height="8" rx="4" fill="#2ea043" opacity="0.6" />
            <rect x="24" y="172" width="130" height="8" rx="4" fill="currentColor" opacity="0.15" />
            <rect x="24" y="192" width="90" height="8" rx="4" fill="currentColor" opacity="0.15" />
          </g>
          <g transform="translate(196, 210)">
            <circle cx="0" cy="0" r="28" fill="var(--accent-primary)" opacity="0.8" />
            <path d="M-10 -6 L4 -6 L4 -12 L14 0 L4 12 L4 6 L-10 6 Z" fill="var(--bg-primary)" />
          </g>
        </svg>
      </div>
      <h2>MakeDiff</h2>
      <p className="empty-state-subtitle">
        for
        <MakeLogo className="make-logo" viewBox="120 150 240 175" width="28" height="20" gradientId="make-grad" />
        <span className="make-brand">make.com</span>
      </p>
      <p>Search for an app in the sidebar to get started.</p>
      <div className="empty-state-shortcuts">
        <div className="shortcut-item">
          <kbd>&#8984;</kbd>
          <kbd>,</kbd>
          <span>Settings</span>
        </div>
        <div className="shortcut-item">
          <kbd>&#8984;</kbd>
          <kbd>D</kbd>
          <span>Download</span>
        </div>
      </div>
    </div>
  )
}
