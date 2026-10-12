import type { ReactNode } from 'react'

interface MakeLogoProps {
  className: string
  viewBox: string
  width: string
  height: string
  gradientId: string
  children?: ReactNode
}

const MARK_PATH =
  'M216.46,298.9l31.79-132.55c.63-2.62,3.26-4.23,5.88-3.6l37.86,9.08c2.62.63,4.23,3.26,3.6,5.88l-31.79,132.55c-.63,2.62-3.26,4.23-5.88,3.6l-37.86-9.08c-2.61-.64-4.22-3.26-3.6-5.88ZM305.18,313.01h38.95c2.69,0,4.87-2.18,4.87-4.86h0v-136.31c0-2.69-2.18-4.87-4.86-4.87h-38.95c-2.69,0-4.87,2.18-4.87,4.86h0v136.31c0,2.69,2.18,4.87,4.86,4.87h0ZM136.39,293.6l35.01,17.08c2.41,1.18,5.32.17,6.5-2.24,0,0,0,0,0,0l59.78-122.5c1.18-2.41.17-5.32-2.24-6.5,0,0,0,0,0,0l-35.01-17.08c-2.41-1.18-5.32-.17-6.5,2.24,0,0,0,0,0,0l-59.76,122.48c-1.19,2.42-.19,5.33,2.23,6.52,0,0,0,0,0,0h0Z'

export default function MakeLogo({ className, viewBox, width, height, gradientId, children }: Readonly<MakeLogoProps>) {
  return (
    <svg className={className} viewBox={viewBox} width={width} height={height}>
      <defs>
        <radialGradient
          id={gradientId}
          cx="-2611.69"
          cy="9830.79"
          fx="-2611.69"
          fy="9830.79"
          r="1.62"
          gradientTransform="translate(397367.47 1495683.63) scale(152.03 -152.13)"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset=".2" stopColor="#f024f6" />
          <stop offset=".39" stopColor="#c416f8" />
          <stop offset=".61" stopColor="#9406f9" />
          <stop offset=".72" stopColor="#8200fa" />
        </radialGradient>
      </defs>
      <path fill={`url(#${gradientId})`} d={MARK_PATH} />
      {children}
    </svg>
  )
}
