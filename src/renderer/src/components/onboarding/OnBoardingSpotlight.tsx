interface OnBoardingSpotlightProps {
  pathD: string
  cutoutPathD?: string
  viewportWidth: number
  viewportHeight: number
  fillColor?: string
  fillOpacity?: number
  borderColor?: string
  borderWidth?: number
  onDimClick?: () => void
}

export default function OnBoardingSpotlight({
  pathD,
  cutoutPathD = '',
  viewportWidth,
  viewportHeight,
  fillColor = 'rgb(15, 23, 42)',
  fillOpacity = 0.42,
  borderColor = 'color-mix(in srgb, var(--primary) 70%, transparent)',
  borderWidth = 1,
  onDimClick
}: OnBoardingSpotlightProps) {
  return (
    <svg
      className="onboarding-spotlight-svg"
      viewBox={`0 0 ${viewportWidth} ${viewportHeight}`}
      preserveAspectRatio="xMinYMin slice"
      aria-hidden="true"
      focusable="false"
    >
      {cutoutPathD && (
        <path
          data-testid="onboarding-spotlight-path"
          d={pathD}
          fill={fillColor}
          fillOpacity={fillOpacity}
          fillRule="evenodd"
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
            onDimClick?.()
          }}
        />
      )}
      {cutoutPathD && (
        <path
          data-testid="onboarding-spotlight-border"
          d={cutoutPathD}
          fill="none"
          stroke={borderColor}
          strokeWidth={borderWidth}
        />
      )}
    </svg>
  )
}
