import { useState, useCallback, useEffect } from 'react'
import { Icon } from '@iconify/react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@shadcn/components/ui/tooltip'
import { Button } from '@shadcn/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@shadcn/components/ui/dialog'
import { useProviderStore } from '@/stores/providerStore'

interface VoiceCallWidgetProps {
  variant: 'chat' | 'newThread'
  activeProviderId?: string | null
  isStreaming?: boolean
  onActiveChange?: (value: boolean) => void
}

export default function VoiceCallWidget({
  variant,
  activeProviderId = null,
  isStreaming = false,
  onActiveChange
}: VoiceCallWidgetProps) {
  const providerStore = useProviderStore()

  const [voiceAIAgentId, setVoiceAIAgentId] = useState('')
  const [callDialogOpen, setCallDialogOpen] = useState(false)
  const [callWidgetKey, setCallWidgetKey] = useState(0)
  const [voiceWidgetReady, setVoiceWidgetReady] = useState(false)
  const [voiceWidgetLoading, setVoiceWidgetLoading] = useState(false)

  const isCallActive = callDialogOpen

  const voiceAIApiKey =
    providerStore.providers.find((provider) => provider.id === 'voiceai')?.apiKey || ''

  const shouldShowVoiceCall =
    variant === 'chat' &&
    activeProviderId === 'voiceai' &&
    voiceAIAgentId.length > 0 &&
    voiceAIApiKey.length > 0

  const loadVoiceAIConfig = useCallback(async () => {
    const config = await providerStore.getVoiceAIConfig()
    setVoiceAIAgentId(config.agentId?.trim() || '')
  }, [providerStore])

  const hasVoiceWidgetDefinition = useCallback(() => {
    return typeof window !== 'undefined' && !!window.customElements?.get('voice-agent-widget')
  }, [])

  const ensureVoiceAIWidgetScript = useCallback(() => {
    if (hasVoiceWidgetDefinition()) {
      setVoiceWidgetReady(true)
      setVoiceWidgetLoading(false)
      return Promise.resolve()
    }

    setVoiceWidgetLoading(true)

    return new Promise<void>((resolve) => {
      let settled = false
      const finalize = (ready: boolean) => {
        if (settled) return
        settled = true
        setVoiceWidgetReady(ready)
        setVoiceWidgetLoading(false)
        if (!ready) resolve()
      }

      const handleLoad = () => finalize(hasVoiceWidgetDefinition())
      const handleError = () => finalize(false)
      const fallbackTimer = setTimeout(() => finalize(hasVoiceWidgetDefinition()), 4000)

      const script = document.createElement('script')
      script.id = 'voice-ai-widget-script'
      script.src = 'https://voice.ai/app/voice-agent-widget.js'
      script.async = true
      script.addEventListener(
        'load',
        () => {
          clearTimeout(fallbackTimer)
          handleLoad()
        },
        { once: true }
      )
      script.addEventListener(
        'error',
        () => {
          clearTimeout(fallbackTimer)
          handleError()
        },
        { once: true }
      )
      document.head.appendChild(script)
    })
  }, [hasVoiceWidgetDefinition])

  const startVoiceCall = useCallback(async () => {
    await loadVoiceAIConfig()
    if (!voiceAIAgentId || !voiceAIApiKey) return
    void ensureVoiceAIWidgetScript()
    setCallWidgetKey((k) => k + 1)
    setCallDialogOpen(true)
  }, [loadVoiceAIConfig, voiceAIAgentId, voiceAIApiKey, ensureVoiceAIWidgetScript])

  useEffect(() => {
    if (activeProviderId === 'voiceai') {
      void loadVoiceAIConfig()
      void ensureVoiceAIWidgetScript()
    }
  }, [activeProviderId])

  useEffect(() => {
    const agentId = providerStore.voiceAIConfig?.agentId
    setVoiceAIAgentId(agentId?.trim() || '')
  }, [providerStore.voiceAIConfig?.agentId])

  useEffect(() => {
    onActiveChange?.(callDialogOpen)
    if (callDialogOpen) {
      void ensureVoiceAIWidgetScript()
    } else {
      setCallWidgetKey((k) => k + 1)
    }
  }, [callDialogOpen])

  return (
    <>
      {shouldShowVoiceCall && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="w-7 h-7 text-xs rounded-lg"
              disabled={isStreaming || isCallActive}
              onClick={startVoiceCall}
            >
              <Icon icon="lucide:phone-call" className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Start voice call</TooltipContent>
        </Tooltip>
      )}

      <Dialog open={callDialogOpen} onOpenChange={setCallDialogOpen}>
        <DialogContent className="w-105 p-4">
          <DialogHeader>
            <DialogTitle>Voice Call</DialogTitle>
            <DialogDescription>Start a voice conversation with the AI assistant</DialogDescription>
          </DialogHeader>
          <div className="w-full max-w-105">
            {callDialogOpen && (
              <voice-agent-widget
                key={callWidgetKey}
                api-key={voiceAIApiKey}
                data-agent-id={voiceAIAgentId}
                data-start-text="Start"
                data-stop-text="Stop"
                data-show-time="true"
                data-show-mic-status="true"
                data-width="386"
                data-height="220"
                className="w-full"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
