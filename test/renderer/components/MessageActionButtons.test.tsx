import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MessageActionButtons from '@/components/message/MessageActionButtons'

describe('MessageActionButtons', () => {
  it('calls callback props on clicks', async () => {
    const onOpenWorkspace = vi.fn()
    const onClean = vi.fn()
    const onScrollToBottom = vi.fn()

    render(
      <MessageActionButtons
        showCleanButton
        showScrollButton
        showWorkspaceButton
        onOpenWorkspace={onOpenWorkspace}
        onClean={onClean}
        onScrollToBottom={onScrollToBottom}
      />
    )

    const buttons = screen.getAllByRole('button')

    await fireEvent.click(buttons[0])
    expect(onOpenWorkspace).toHaveBeenCalled()

    await fireEvent.click(buttons[1])
    expect(onClean).toHaveBeenCalled()

    await fireEvent.click(buttons[2])
    expect(onScrollToBottom).toHaveBeenCalled()
  })
})
