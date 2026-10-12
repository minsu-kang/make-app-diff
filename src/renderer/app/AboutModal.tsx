import MakeLogo from '../shared/ui/MakeLogo'
import { getAppVersion } from '../shared/api/electron-api'

interface AboutModalProps {
  onClose: () => void
}

export default function AboutModal({ onClose }: Readonly<AboutModalProps>) {
  const version = getAppVersion()

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>About</h2>
          <button className="btn-icon" onClick={onClose}>
            &#10005;
          </button>
        </div>
        <div className="info-panel-body info-about">
          <MakeLogo
            className="info-make-logo"
            viewBox="0 0 1230.4 434.44"
            width="140"
            height="50"
            gradientId="make-grad-about"
          >
            <path
              fill="var(--text-primary)"
              d="M464.66,221.49v86.43c0,2.8-2.26,5.08-5.06,5.08h-37.39c-2.81,0-5.08-2.28-5.08-5.08v-135.86c0-2.81,2.28-5.08,5.08-5.08h37.35c2.8,0,5.08,2.26,5.08,5.06h0v10.14c9.82-12.59,25.09-19.69,41.05-19.08,16.31-.64,31.84,6.97,41.33,20.25,11.56-13.46,28.63-20.92,46.36-20.25,32.86,0,55.46,19.36,55.46,56.33v88.5c0,2.8-2.26,5.08-5.06,5.08h-37.31c-2.81,0-5.08-2.28-5.08-5.08v-78.53c0-16.14-9.09-24.06-21.42-24.06-10.24.33-19.32,6.66-23.19,16.14v86.45c0,2.8-2.26,5.08-5.06,5.08h-37.39c-2.81,0-5.08-2.28-5.08-5.08v-78.53c0-16.14-9.09-24.06-21.42-24.06-10.26.26-19.37,6.61-23.16,16.15Z M712.38,315.95c-27.58,0-50.77-18.19-50.77-46.36,0-25.81,17.02-37.84,48.7-46.06l40.5-10.56c-1.17-9.69-8.81-14.38-21.12-14.38-10.88,0-18.77,4.18-22.4,12.53-.95,2.35-3.47,3.67-5.94,3.1l-32.1-7.61c-2.74-.66-4.43-3.41-3.78-6.16.05-.18.1-.36.17-.55,9.21-24.92,34.79-37.98,65.77-37.98,41.66,0,65.72,19.66,65.72,54.27v91.71c0,2.81-2.28,5.08-5.08,5.08h-35.38c-2.76,0-5.01-2.21-5.08-4.97l-.18-7.61-.3.3c-10.5,9.82-24.34,15.27-38.71,15.23ZM724.41,279.28c6.41-.17,12.62-2.21,17.89-5.86l8.22-4.98.3-23.77-21.12,5.86c-14.38,4.11-20.83,7.61-20.83,15.84,0,9.09,7.92,12.91,15.55,12.91h0Z M873.05,243.77l-14.38,13.2v50.93c0,2.8-2.26,5.08-5.06,5.08h-36.5c-2.81,0-5.08-2.28-5.08-5.08V123.28c0-2.81,2.28-5.08,5.08-5.08h36.49c2.81,0,5.08,2.28,5.08,5.08v83.53l42.55-39.15c.95-.86,2.19-1.34,3.47-1.34h45.03c2.81,0,5.08,2.28,5.08,5.08,0,1.43-.61,2.8-1.67,3.76l-43.72,39.84,49.83,90.44c1.36,2.45.47,5.54-1.98,6.9-.76.42-1.61.64-2.48.64h-42.57c-1.9,0-3.63-1.06-4.51-2.74l-34.68-66.48Z M1027.83,316.25c-40.78,0-78.05-25.52-78.05-77.21,0-48.7,35.8-76.86,75.11-76.86s70.42,28.45,71.6,73.34c.13,4.74.2,8.04.25,10.4.03,2.8-2.21,5.1-5.01,5.13,0,0,0,0,0,0h-94.98c1.47,17.61,15.55,28.75,33.46,28.75,11.96.28,23.32-5.26,30.45-14.87,1.62-2.11,4.61-2.59,6.82-1.09l23.72,15.88c2.34,1.6,2.96,4.79,1.37,7.15,0,.02-.02.02-.02.03-12.68,18.7-33.63,29.34-64.7,29.34ZM997.61,222.35h51.35c-.3-16.7-12.61-24.05-25.52-24.05-13.63-.62-25.18,9.92-25.8,23.55,0,0,0,.01,0,.02-.03.16-.04.32-.03.48Z"
            />
          </MakeLogo>
          <h3 className="info-app-title">MakeDiff</h3>
          <p className="info-app-desc">App version diff viewer</p>
          <div className="info-row">
            <span className="info-label">Version</span>
            <span className="info-value">{version?.app || '1.0.0'}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Electron</span>
            <span className="info-value info-mono">{version?.electron || '-'}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Chrome</span>
            <span className="info-value info-mono">{version?.chrome || '-'}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Node</span>
            <span className="info-value info-mono">{version?.node || '-'}</span>
          </div>
          <p className="info-copyright">&copy; {new Date().getFullYear()} Minsu Kang</p>
        </div>
      </div>
    </div>
  )
}
