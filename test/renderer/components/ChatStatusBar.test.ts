import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { ACP_WORKSPACE_EVENTS } from '@/events'
import type { ReasoningEffort, ReasoningPortrait } from '../../../src/shared/types/model-db'
import type { AcpConfigState } from '../../../src/shared/types/presenters'
import type { ImageGenerationOptions } from '../../../src/shared/imageGenerationSettings'

const TEST_TIMEOUT_MS = 20000

describe('ChatStatusBar model and session panels', () => {
  // TODO: flesh out React test — system prompt section, subagent toggle, model picker loading
  // state, retry state, compact model ids, embedding/rerank filtering, Ollama filtering,
  // reasoning effort controls, anthropic adaptive reasoning, visibility controls,
  // image generation settings panel, numeric settings stepping, thinking budget toggle,
  // model switching, draft selection, ACP badge and warmup config, ACP session config,
  // overflow options, config cache isolation
  it('placeholder: module imports resolve', async () => {
    expect(true).toBe(true)
  })
})
