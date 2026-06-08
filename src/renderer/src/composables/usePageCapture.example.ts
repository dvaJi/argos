import { useState, useEffect } from 'react'
import { createDeviceClient } from '@api/DeviceClient'
import { usePageCapture, createCapturePresets } from '@/composables/usePageCapture'

export function useMessageCapture() {
  const { isCapturing, captureAndCopy } = usePageCapture()
  const deviceClient = createDeviceClient()
  const [appVersion, setAppVersion] = useState('')

  useEffect(() => {
    deviceClient.getAppVersion().then((version) => {
      setAppVersion(version)
    })
  }, [])

  const getWatermarkConfig = (isDark: boolean, modelName?: string, providerName?: string) => ({
    isDark,
    version: appVersion,
    texts: {
      brand: 'DeepChat',
      tip: 'Shared from DeepChat',
      model: modelName,
      provider: providerName
    }
  })

  const calculateMessageGroupRect = (messageNode: HTMLElement, parentId?: string) => {
    const userMessageElement = parentId
      ? (document.querySelector(`[data-message-id="${parentId}"]`) as HTMLElement)
      : null

    if (!userMessageElement || !messageNode) {
      if (messageNode) {
        const rect = messageNode.getBoundingClientRect()
        return {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        }
      }
      return null
    }

    const userRect = userMessageElement.getBoundingClientRect()
    const assistantRect = messageNode.getBoundingClientRect()

    const left = Math.min(userRect.left, assistantRect.left)
    const top = Math.min(userRect.top, assistantRect.top)
    const right = Math.max(userRect.right, assistantRect.right)
    const bottom = Math.max(userRect.bottom, assistantRect.bottom)

    return {
      x: Math.round(left),
      y: Math.round(top),
      width: Math.round(right - left),
      height: Math.round(bottom - top)
    }
  }

  const calculateFromTopToCurrentRect = (currentMessageNode: HTMLElement) => {
    const container = document.querySelector('.message-list-container')
    if (!container || !currentMessageNode) return null

    const allMessages = container.querySelectorAll('[data-message-id]')
    if (allMessages.length === 0) return null

    const firstMessage = allMessages[0] as HTMLElement
    const currentRect = currentMessageNode.getBoundingClientRect()
    const firstRect = firstMessage.getBoundingClientRect()

    const left = Math.min(firstRect.left, currentRect.left)
    const top = Math.min(firstRect.top, currentRect.top)
    const right = Math.max(firstRect.right, currentRect.right)
    const bottom = Math.max(firstRect.bottom, currentRect.bottom)

    return {
      x: Math.round(left),
      y: Math.round(top),
      width: Math.round(right - left),
      height: Math.round(bottom - top)
    }
  }

  const captureMessageGroup = async (
    messageNode: HTMLElement,
    parentId: string | undefined,
    isDark: boolean,
    modelName?: string,
    providerName?: string
  ) => {
    return await captureAndCopy({
      container: '.message-list-container',
      getTargetRect: () => calculateMessageGroupRect(messageNode, parentId),
      watermark: getWatermarkConfig(isDark, modelName, providerName)
    })
  }

  const captureFromTopToCurrent = async (
    currentMessageNode: HTMLElement,
    isDark: boolean,
    modelName?: string,
    providerName?: string
  ) => {
    return await captureAndCopy({
      container: '.message-list-container',
      getTargetRect: () => calculateFromTopToCurrentRect(currentMessageNode),
      watermark: getWatermarkConfig(isDark, modelName, providerName)
    })
  }

  const captureFullConversation = async (
    isDark: boolean,
    modelName?: string,
    providerName?: string
  ) => {
    const { captureFullConversation } = createCapturePresets()
    const config = captureFullConversation(getWatermarkConfig(isDark, modelName, providerName))
    return await captureAndCopy(config)
  }

  const captureMessageRange = async (
    startMessageId: string,
    endMessageId: string,
    isDark: boolean,
    modelName?: string,
    providerName?: string
  ) => {
    const { captureMessageRange } = createCapturePresets()
    const config = captureMessageRange(
      startMessageId,
      endMessageId,
      getWatermarkConfig(isDark, modelName, providerName)
    )
    return await captureAndCopy(config)
  }

  return {
    isCapturing,
    captureMessageGroup,
    captureFromTopToCurrent,
    captureFullConversation,
    captureMessageRange
  }
}
