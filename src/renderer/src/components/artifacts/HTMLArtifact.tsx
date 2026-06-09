import React, { useEffect, useMemo, useRef } from 'react'

interface HTMLArtifactProps {
  block: { artifact: { type: string; title: string }; content: string }
  isPreview: boolean
  viewportSize?: 'desktop' | 'tablet' | 'mobile'
  className?: string
}

const VIEWPORT_SIZES: Record<string, { width: number; height: number }> = {
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 667 }
}

export function HTMLArtifact({
  block,
  isPreview,
  viewportSize = 'desktop',
  className
}: HTMLArtifactProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const resolvedViewportSize = viewportSize || 'desktop'

  const containerClasses =
    resolvedViewportSize === 'desktop'
      ? 'flex h-full min-h-0 w-full overflow-hidden'
      : 'flex h-full min-h-0 w-full items-center justify-center overflow-auto'

  const frameContainerClasses =
    resolvedViewportSize === 'desktop' ? 'h-full min-h-0 w-full' : 'relative shrink-0'

  const viewportClasses =
    resolvedViewportSize === 'desktop'
      ? 'html-iframe-wrapper transition-all duration-300 ease-in-out block h-full min-h-0 w-full'
      : 'html-iframe-wrapper transition-all duration-300 ease-in-out border border-gray-300 dark:border-gray-600 relative'

  const viewportStyles =
    resolvedViewportSize === 'mobile' || resolvedViewportSize === 'tablet'
      ? VIEWPORT_SIZES[resolvedViewportSize]
      : {}

  const setupIframe = () => {
    if (isPreview && iframeRef.current) {
      const iframe = iframeRef.current
      iframe.onload = () => {
        const doc = iframe.contentDocument
        if (!doc) return

        let viewportContent = 'width=device-width, initial-scale=1.0'
        if (resolvedViewportSize === 'mobile' || resolvedViewportSize === 'tablet') {
          viewportContent = `width=${VIEWPORT_SIZES[resolvedViewportSize].width}, initial-scale=1.0`
        }

        const existingViewport = doc.querySelector('meta[name="viewport"]')
        if (existingViewport) existingViewport.remove()

        const viewportMeta = doc.createElement('meta')
        viewportMeta.name = 'viewport'
        viewportMeta.content = viewportContent
        doc.head.appendChild(viewportMeta)

        const resetCSS = `* { margin: 0; padding: 0; box-sizing: border-box; } html, body { height: 100%; font-family: var(--dc-font-family, Arial, sans-serif); } img { max-width: 100%; height: auto; } a { text-decoration: none; color: inherit; }`
        const styleElement = doc.createElement('style')
        styleElement.textContent = resetCSS
        doc.head.appendChild(styleElement)
      }
    }
  }

  useEffect(() => {
    setupIframe()
  }, [])
  useEffect(() => {
    setupIframe()
  }, [viewportSize])

  return (
    <div className={`${containerClasses} ${className ?? ''}`} data-testid="html-artifact-root">
      <div className={frameContainerClasses}>
        <iframe
          ref={iframeRef}
          srcDoc={block.content}
          className={viewportClasses}
          style={viewportStyles}
          sandbox="allow-scripts allow-same-origin"
          data-testid="html-artifact-iframe"
        />
      </div>
    </div>
  )
}
