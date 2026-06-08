import { useState, useCallback } from 'react'

export type ViewportSizeType = 'desktop' | 'tablet' | 'mobile'

interface ViewportDimensions {
  width: number
  height: number
}

const DEFAULT_DIMENSIONS: Record<Exclude<ViewportSizeType, 'desktop'>, ViewportDimensions> = {
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 667 }
}

export function useViewportSize() {
  const [viewportSize, setViewportSize] = useState<ViewportSizeType>('desktop')

  const getDimensions = useCallback((): ViewportDimensions | null => {
    if (viewportSize === 'desktop') return null
    return DEFAULT_DIMENSIONS[viewportSize]
  }, [viewportSize])

  return {
    viewportSize,
    setViewportSize,
    getDimensions,
    TABLET_WIDTH: DEFAULT_DIMENSIONS.tablet.width,
    TABLET_HEIGHT: DEFAULT_DIMENSIONS.tablet.height,
    MOBILE_WIDTH: DEFAULT_DIMENSIONS.mobile.width,
    MOBILE_HEIGHT: DEFAULT_DIMENSIONS.mobile.height
  }
}
