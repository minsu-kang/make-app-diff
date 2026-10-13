import React from 'react'
import './TokenField.css'

const iconProps = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round'
} as const

function EyeOffIcon() {
  return (
    <svg {...iconProps}>
      <path d="M2 2l12 12" />
      <path d="M6.5 6.5a2 2 0 002.8 2.8" />
      <path d="M4.2 4.2C2.8 5.2 1.7 6.5 1 8c1.3 2.8 4 5 7 5 1.2 0 2.3-.3 3.3-.9" />
      <path d="M12.5 10.5C13.8 9.5 14.7 8.3 15 8c-1.3-2.8-4-5-7-5-.7 0-1.4.1-2 .3" />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg {...iconProps}>
      <path d="M1 8c1.3-2.8 4-5 7-5s5.7 2.2 7 5c-1.3 2.8-4 5-7 5S2.3 10.8 1 8z" />
      <circle cx="8" cy="8" r="2" />
    </svg>
  )
}

interface TokenFieldProps {
  label: string
  placeholder: string
  value: string
  visible: boolean
  onChange: (value: string) => void
  onToggle: () => void
}

export default function TokenField({
  label,
  placeholder,
  value,
  visible,
  onChange,
  onToggle
}: Readonly<TokenFieldProps>) {
  return (
    <label>
      <span>{label}</span>
      <div className="input-with-icon">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
        <button
          type="button"
          className="btn-icon token-toggle"
          onClick={onToggle}
          title={visible ? 'Hide token' : 'Show token'}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    </label>
  )
}
