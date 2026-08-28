import { forwardRef, useImperativeHandle, useRef } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "#shadcn/components/ui/tooltip";
import ChatInputBox from "./ChatInputBox";
import ChatInputToolbar from "./ChatInputToolbar";
import ComposerFooterBar from "./ComposerFooterBar";
import type { MessageFile } from "@argos/shared/types/agent-interface";

export interface ThreadComposerHandle {
  clearInput: () => void;
  focusInput: () => void;
  insertWorkspaceReference: (targetPath: string) => boolean;
  getPendingSkillsSnapshot: () => string[];
}

interface ThreadComposerProps {
  message: string;
  onMessageChange: (value: string) => void;
  files: MessageFile[];
  onFilesChange: (files: MessageFile[]) => void;
  onSubmit: () => void;
  onCommandSubmit?: (command: string) => void;
  onPendingSkillsChange?: (skills: string[]) => void;
  /** Bound ACP draft session while composing a new thread (skills routing). */
  sessionId?: string | null;
  workspacePath?: string | null;
  isAcpSession?: boolean;
  placeholder?: string;
  maxWidthClass?: string;
  /** Gates Enter-to-send and the send button when `sendDisabled` is unset. */
  submitDisabled?: boolean;
  /** Defaults to `submitDisabled || !hasInput`. */
  sendDisabled?: boolean;
  isSending?: boolean;
  isGenerating?: boolean;
  isCancelling?: boolean;
  queueDisabled?: boolean;
  onQueueSubmit?: () => void;
  onSteer?: () => void;
  onStop?: () => void;
}

/**
 * The one composer used by every thread surface (new thread, welcome, chat).
 *
 * Layout mirrors the OpenCode pattern: a single rounded input card whose
 * footer row holds the attach button and the model / effort / mode chips
 * (`ComposerFooterBar`, backed by `draftStore` pre-session) on the left, and
 * the steer / send / queue / stop cluster on the right. Pages size it via
 * `maxWidthClass` and place context chips below the card themselves.
 */
const ThreadComposer = forwardRef<ThreadComposerHandle, ThreadComposerProps>(
  (
    {
      message,
      onMessageChange,
      files,
      onFilesChange,
      onSubmit,
      onCommandSubmit,
      onPendingSkillsChange,
      sessionId = null,
      workspacePath = null,
      isAcpSession = false,
      placeholder,
      maxWidthClass = "w-full",
      submitDisabled = false,
      sendDisabled,
      isSending = false,
      isGenerating = false,
      isCancelling = false,
      queueDisabled = false,
      onQueueSubmit,
      onSteer,
      onStop,
    },
    ref,
  ) => {
    const chatInputRef = useRef<{
      triggerAttach: () => void;
      insertWorkspaceReference: (targetPath: string) => boolean;
      getPendingSkillsSnapshot: () => string[];
      focusInput: () => void;
      clearInput: () => void;
    } | null>(null);

    const hasInput = Boolean(message.trim()) || files.length > 0;
    const isSendBlocked = sendDisabled ?? (submitDisabled || !hasInput);

    useImperativeHandle(
      ref,
      () => ({
        clearInput: () => chatInputRef.current?.clearInput(),
        focusInput: () => chatInputRef.current?.focusInput(),
        insertWorkspaceReference: (targetPath: string) =>
          chatInputRef.current?.insertWorkspaceReference(targetPath) ?? false,
        getPendingSkillsSnapshot: () => chatInputRef.current?.getPendingSkillsSnapshot() ?? [],
      }),
      [],
    );

    const handleAttach = () => {
      chatInputRef.current?.triggerAttach();
    };

    return (
      <ChatInputBox
        ref={chatInputRef}
        modelValue={message}
        onUpdateModelValue={onMessageChange}
        files={files}
        onUpdateFiles={onFilesChange}
        onCommandSubmit={onCommandSubmit}
        onPendingSkillsChange={onPendingSkillsChange}
        onSubmit={onSubmit}
        sessionId={sessionId}
        workspacePath={workspacePath}
        isAcpSession={isAcpSession}
        isGenerating={isGenerating}
        submitDisabled={submitDisabled}
        queueSubmitEnabled={isGenerating && hasInput}
        queueSubmitDisabled={queueDisabled}
        maxWidthClass={maxWidthClass}
        placeholder={placeholder}
        footerLeft={
          <>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground"
                    onClick={handleAttach}
                  />
                }
              >
                <Icon icon="lucide:plus" className="h-4 w-4" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Attach file</p>
              </TooltipContent>
            </Tooltip>
            <ComposerFooterBar />
          </>
        }
        toolbar={
          <ChatInputToolbar
            isGenerating={isGenerating}
            isCancelling={isCancelling}
            hasInput={hasInput}
            sendDisabled={isSendBlocked}
            isSending={isSending}
            queueDisabled={queueDisabled}
            onSend={onSubmit}
            onQueue={onQueueSubmit}
            onSteer={onSteer}
            onStop={onStop}
          />
        }
      />
    );
  },
);

ThreadComposer.displayName = "ThreadComposer";

export default ThreadComposer;
