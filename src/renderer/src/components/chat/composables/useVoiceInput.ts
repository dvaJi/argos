import { useAudioRecorder } from './useAudioRecorder'

export type VoiceInputErrorCode = string

export type VoiceInputAudioPayload = {
  blob: Blob
  mimeType: string
}

export interface VoiceInputController {
  isSupported: boolean
  isListening: boolean
  start: () => Promise<boolean> | boolean
  stop: () => void
  toggle: () => Promise<boolean> | boolean
  cleanup: () => void
}

export type VoiceInputProvider = 'local-recorder'

export function useVoiceInput(options: {
  provider?: VoiceInputProvider
  onAudio: (payload: VoiceInputAudioPayload) => void
  onUnsupported?: () => void
  onError?: (code: VoiceInputErrorCode) => void
}): VoiceInputController {
  const provider = options.provider ?? 'local-recorder'

  const recorder = useAudioRecorder({
    onRecorded: options.onAudio,
    onUnsupported: options.onUnsupported,
    onError: options.onError
  })

  if (provider === 'local-recorder') {
    return {
      isSupported: recorder.isSupported,
      isListening: recorder.isRecording,
      start: recorder.start,
      stop: recorder.stop,
      toggle: recorder.toggle,
      cleanup: recorder.cleanup
    }
  }

  return {
    isSupported: false,
    isListening: false,
    start: () => {
      options.onUnsupported?.()
      return false
    },
    stop: () => {},
    toggle: () => {
      options.onUnsupported?.()
      return false
    },
    cleanup: () => {}
  }
}
