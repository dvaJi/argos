import { useState, useEffect, useMemo, useRef } from 'react'
import type { CONVERSATION_SETTINGS } from '@shared/presenter'
import { createProviderClient } from '@api/ProviderClient'
import { providerStore } from '@/stores/providerStore'
import { useStore } from '@tanstack/react-store'

export interface RateLimitStatus {
  config: {
    enabled: boolean
    qpsLimit: number
  }
  currentQps: number
  queueLength: number
  lastRequestTime: number
}

export function useRateLimitStatus(chatConfig: CONVERSATION_SETTINGS) {
  const providerClient = createProviderClient()
  const providers = useStore(providerStore, (s) => s.providers)

  const [rateLimitStatus, setRateLimitStatus] = useState<RateLimitStatus | null>(null)
  const statusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const chatConfigRef = useRef(chatConfig)
  chatConfigRef.current = chatConfig
  const providersRef = useRef(providers)
  providersRef.current = providers

  const canSendImmediately = useMemo(() => {
    if (!rateLimitStatus?.config.enabled) return true

    const now = Date.now()
    const intervalMs = (1 / rateLimitStatus.config.qpsLimit) * 1000
    const timeSinceLastRequest = now - rateLimitStatus.lastRequestTime

    return timeSinceLastRequest >= intervalMs
  }, [rateLimitStatus])

  const isRateLimitEnabled = (): boolean => {
    const currentProviderId = chatConfigRef.current.providerId
    if (!currentProviderId) return false

    const provider = providersRef.current.find((p) => p.id === currentProviderId)
    return provider?.rateLimit?.enabled ?? false
  }

  const stopRateLimitPolling = () => {
    if (statusIntervalRef.current) {
      clearInterval(statusIntervalRef.current)
      statusIntervalRef.current = null
    }
  }

  const loadRateLimitStatus = async () => {
    const currentProviderId = chatConfigRef.current.providerId
    if (!currentProviderId) return

    if (!isRateLimitEnabled()) {
      setRateLimitStatus(null)
      return
    }

    try {
      const status = await providerClient.getProviderRateLimitStatus(currentProviderId)
      setRateLimitStatus(status)
    } catch (error) {
      console.error('Failed to load rate limit status:', error)
    }
  }

  const startRateLimitPolling = () => {
    stopRateLimitPolling()
    if (isRateLimitEnabled()) {
      statusIntervalRef.current = setInterval(loadRateLimitStatus, 1000)
    }
  }

  const getRateLimitStatusIcon = (): string => {
    if (!rateLimitStatus?.config.enabled) return ''

    if (rateLimitStatus.queueLength > 0) {
      return 'lucide:clock'
    }

    return canSendImmediately ? 'lucide:check-circle' : 'lucide:timer'
  }

  const getRateLimitStatusClass = (): string => {
    if (!rateLimitStatus?.config.enabled) return ''

    if (rateLimitStatus.queueLength > 0) {
      return 'text-orange-500'
    }

    return canSendImmediately ? 'text-green-500' : 'text-yellow-500'
  }

  const getRateLimitStatusTooltip = (): string => {
    if (!rateLimitStatus?.config.enabled) return ''

    const intervalSeconds = 1 / rateLimitStatus.config.qpsLimit

    if (rateLimitStatus.queueLength > 0) {
      return `Rate limit: ${rateLimitStatus.queueLength} queued (${intervalSeconds.toFixed(1)}s interval)`
    }

    if (canSendImmediately) {
      return `Ready to send (${intervalSeconds.toFixed(1)}s interval)`
    }

    const waitTime = Math.ceil(
      (rateLimitStatus.lastRequestTime + intervalSeconds * 1000 - Date.now()) / 1000
    )
    return `Wait ~${waitTime}s (${intervalSeconds.toFixed(1)}s interval)`
  }

  const formatWaitTime = (): string => {
    if (!rateLimitStatus?.config.enabled) return ''

    const intervalSeconds = 1 / rateLimitStatus.config.qpsLimit
    const waitTime = Math.ceil(
      (rateLimitStatus.lastRequestTime + intervalSeconds * 1000 - Date.now()) / 1000
    )

    return `Wait ${Math.max(0, waitTime)}s`
  }

  useEffect(() => {
    loadRateLimitStatus()
    startRateLimitPolling()
  }, [chatConfig.providerId, providers])

  useEffect(() => {
    return () => {
      stopRateLimitPolling()
    }
  }, [])

  return {
    rateLimitStatus,
    canSendImmediately,
    loadRateLimitStatus,
    startRateLimitPolling,
    stopRateLimitPolling,
    getRateLimitStatusIcon,
    getRateLimitStatusClass,
    getRateLimitStatusTooltip,
    formatWaitTime
  }
}
