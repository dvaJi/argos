import { useMemo, useRef, useState, useLayoutEffect } from 'react'
import OnBoardingSpotlight from './OnBoardingSpotlight'
import { useOnBoarding } from '@/composables/useOnBoarding'

type GuidedOnboardingPanelPlacement = 'auto' | 'above' | 'below'

interface GuidedOnboardingOverlayProps {
  visible: boolean
  containerEl: HTMLElement | null
  targetEl: HTMLElement | null
  eyebrow: string
  title: string
  description: string
  stepIndex: number
  totalSteps: number
  closeLabel: string
  backLabel?: string
  primaryLabel?: string
  secondaryLabel?: string
  expertLabel?: string
  caption?: string
  backDisabled?: boolean
  primaryDisabled?: boolean
  secondaryDisabled?: boolean
  expertDisabled?: boolean
  preferredPanelPlacement?: GuidedOnboardingPanelPlacement
  onClose?: () => void
  onBack?: () => void
  onPrimary?: () => void
  onSecondary?: () => void
  onExpert?: () => void
}

const PANEL_MIN_HEIGHT = 156

export default function GuidedOnboardingOverlay({
  visible,
  targetEl,
  eyebrow,
  title,
  description,
  stepIndex,
  totalSteps,
  closeLabel,
  backLabel,
  primaryLabel,
  secondaryLabel,
  expertLabel,
  caption,
  backDisabled = false,
  primaryDisabled = false,
  secondaryDisabled = false,
  expertDisabled = false,
  preferredPanelPlacement = 'auto',
  onClose,
  onBack,
  onPrimary,
  onSecondary,
  onExpert
}: GuidedOnboardingOverlayProps) {
  const panelRef = useRef<HTMLElement | null>(null)

  const { spotlightRect, viewportWidth, viewportHeight, pathD, cutoutPathD } = useOnBoarding(
    () => targetEl,
    { visible: () => visible }
  )

  const [panelActualHeight, setPanelActualHeight] = useState(0)
  useLayoutEffect(() => {
    if (panelRef.current) {
      const rect = panelRef.current.getBoundingClientRect()
      setPanelActualHeight(rect.height)
    }
  })

  const panelStyle = useMemo(() => {
    const rect = spotlightRect.value
    if (!rect) {
      return { top: '24px', left: '24px', width: 'min(320px, calc(100% - 32px))' }
    }

    const panelWidth = Math.min(320, Math.max(180, viewportWidth.value - 32))
    const panelHeightEstimate = Math.max(panelActualHeight, PANEL_MIN_HEIGHT)
    const desiredTop = rect.y + rect.height + 18
    const maxPanelTop = Math.max(16, viewportHeight.value - panelHeightEstimate - 16)
    const aboveTop = Math.max(16, rect.y - panelHeightEstimate - 18)
    const belowTop = Math.min(maxPanelTop, desiredTop)

    const panelTop = (() => {
      if (preferredPanelPlacement === 'above') return aboveTop
      if (preferredPanelPlacement === 'below') return belowTop
      const placeAbove = desiredTop + panelHeightEstimate > viewportHeight.value - 16
      return placeAbove ? aboveTop : belowTop
    })()

    const panelLeft = Math.min(
      Math.max(16, rect.x),
      Math.max(16, viewportWidth.value - panelWidth - 16)
    )

    return {
      top: `${panelTop}px`,
      left: `${panelLeft}px`,
      width: `${panelWidth}px`
    }
  }, [
    spotlightRect.value,
    viewportWidth.value,
    viewportHeight.value,
    panelActualHeight,
    preferredPanelPlacement
  ])

  if (!visible) return null

  return (
    <div data-testid="guided-onboarding-overlay" className="pointer-events-none fixed inset-0 z-70">
      <OnBoardingSpotlight
        pathD={pathD}
        cutoutPathD={cutoutPathD}
        viewportWidth={viewportWidth}
        viewportHeight={viewportHeight}
      />
      <div
        ref={panelRef}
        className="guided-onboarding-panel pointer-events-auto absolute rounded-2xl border border-border/80 bg-background/96 p-4 shadow-2xl backdrop-blur"
        style={panelStyle}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-primary/80">{eyebrow}</p>
          <span className="rounded-full border border-border/70 bg-muted/80 px-2 py-0.5 text-[11px] text-muted-foreground">
            {stepIndex}/{totalSteps}
          </span>
        </div>
        <h2 className="mt-3 text-sm font-semibold text-foreground">{title}</h2>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">{description}</p>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <div className="flex max-w-full flex-wrap items-center gap-2">
            {backLabel && (
              <button
                type="button"
                className="whitespace-nowrap rounded-lg border border-border/80 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground disabled:cursor-not-allowed disabled:text-muted-foreground/50"
                disabled={backDisabled}
                onClick={onBack}
              >
                {backLabel}
              </button>
            )}
            {secondaryLabel && (
              <button
                type="button"
                className="whitespace-nowrap rounded-lg border border-border/80 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground disabled:cursor-not-allowed disabled:text-muted-foreground/50"
                disabled={secondaryDisabled}
                onClick={onSecondary}
              >
                {secondaryLabel}
              </button>
            )}
          </div>
          <div className="flex max-w-full flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              className="whitespace-nowrap rounded-lg border border-border/80 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
              onClick={onClose}
            >
              {closeLabel}
            </button>
            {expertLabel && (
              <button
                type="button"
                className="whitespace-nowrap rounded-lg border border-border/80 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground disabled:cursor-not-allowed disabled:text-muted-foreground/50"
                disabled={expertDisabled}
                onClick={onExpert}
              >
                {expertLabel}
              </button>
            )}
            {primaryLabel && (
              <button
                type="button"
                className="whitespace-nowrap rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={primaryDisabled}
                onClick={onPrimary}
              >
                {primaryLabel}
              </button>
            )}
          </div>
        </div>
        {caption && <div className="mt-3 text-[11px] text-muted-foreground/80">{caption}</div>}
      </div>
    </div>
  )
}
