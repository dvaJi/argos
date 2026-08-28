import {
  type ReactNode,
  type KeyboardEvent,
  type ClipboardEvent,
  type DragEvent,
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import Mention from "@tiptap/extension-mention";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import Placeholder from "@tiptap/extension-placeholder";
import HardBreak from "@tiptap/extension-hard-break";
import History from "@tiptap/extension-history";
import { TextSelection } from "@tiptap/pm/state";
import { Icon } from "@iconify/react";
import type { MessageFile } from "@argos/shared/types/agent-interface";
import {
  buildChatInputWorkspaceReferenceText,
  getChatInputWorkspaceItemDragData,
} from "#/lib/chatInputWorkspaceReference";
import { extractPlainUrlFromClipboard } from "#/lib/clipboardUrlPaste";
import { useChatInputMentions } from "./composables/useChatInputMentions";
import { useChatInputFiles } from "./composables/useChatInputFiles";
import { useSkillsData } from "#/components/chat-input/composables/useSkillsData";
import CommandInputDialog from "./mentions/CommandInputDialog";
import ChatAttachmentItem from "./ChatAttachmentItem";

const SlashMention = Mention.extend({ name: "slashMention" });

interface ChatInputBoxProps {
  modelValue?: string;
  placeholder?: string;
  sessionId?: string | null;
  workspacePath?: string | null;
  isAcpSession?: boolean;
  isGenerating?: boolean;
  submitDisabled?: boolean;
  queueSubmitEnabled?: boolean;
  queueSubmitDisabled?: boolean;
  maxWidthClass?: string;
  files?: MessageFile[];
  onUpdateModelValue?: (value: string) => void;
  onSubmit?: () => void;
  onQueueSubmit?: () => void;
  onUpdateFiles?: (files: MessageFile[]) => void;
  onCommandSubmit?: (command: string) => void;
  onPendingSkillsChange?: (skills: string[]) => void;
  toolbar?: ReactNode;
  footerLeft?: ReactNode;
}

const ChatInputBox = forwardRef<
  {
    triggerAttach: () => void;
    insertWorkspaceReference: (targetPath: string) => boolean;
    getPendingSkillsSnapshot: () => string[];
    focusInput: () => void;
    clearInput: () => void;
  },
  ChatInputBoxProps
>(
  (
    {
      modelValue = "",
      placeholder = "",
      sessionId = null,
      workspacePath = null,
      isAcpSession = false,
      isGenerating = false,
      submitDisabled = false,
      queueSubmitEnabled = false,
      queueSubmitDisabled = false,
      maxWidthClass = "max-w-2xl",
      files: externalFiles = [],
      onUpdateModelValue,
      onSubmit,
      onQueueSubmit,
      onUpdateFiles,
      onCommandSubmit,
      onPendingSkillsChange,
      toolbar,
      footerLeft,
    },
    ref,
  ) => {
    const [isComposing, setIsComposing] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const resolvedPlaceholder = placeholder?.trim() || "Type a message...";

    const toEditorDoc = (text: string) => {
      const lines = text.replace(/\r/g, "").split("\n");
      return {
        type: "doc" as const,
        content: lines.map((line) => ({
          type: "paragraph" as const,
          content: line ? [{ type: "text" as const, text: line }] : [],
        })),
      };
    };

    const getEditorText = (ed: Editor): string => {
      return ed.getText({ blockSeparator: "\n" });
    };

    const setCaretToEnd = (ed: Editor) => {
      const end = TextSelection.atEnd(ed.state.doc);
      ed.view.dispatch(ed.state.tr.setSelection(end));
    };

    const conversationId = useMemo(() => sessionId, [sessionId]);
    const skillsData = useSkillsData(conversationId);
    const activeSkillNames = useMemo(() => skillsData.activeSkills, [skillsData.activeSkills]);

    const editorRef = useRef<Editor | null>(null);

    const mentions = useChatInputMentions({
      getEditor: () => editorRef.current,
      workspacePath,
      sessionId,
      isAcpSession,
      isGenerating,
      compactCommandDescription: "Compact conversation",
      onCommandSubmit: (command: string) => onCommandSubmit?.(command),
      onActivateSkill: async (skillName: string) => {
        await skillsData.activateSkill(skillName);
      },
    });

    const dialogState = mentions.dialogState;

    const fileInputProxy = useRef<HTMLInputElement | null>(null);
    useEffect(() => {
      fileInputProxy.current = fileInputRef.current;
    });

    const filesHelper = useChatInputFiles(fileInputProxy as any, (_event: any, nextFiles: MessageFile[]) => {
      onUpdateFiles?.([...nextFiles]);
    });

    const editor = useEditor({
      extensions: [
        Document,
        Paragraph,
        Text,
        History,
        Mention.configure({
          suggestion: mentions.atSuggestion as any,
          deleteTriggerWithBackspace: true,
        }),
        SlashMention.configure({
          suggestion: mentions.slashSuggestion as any,
          deleteTriggerWithBackspace: true,
        }),
        Placeholder.configure({
          placeholder: () => resolvedPlaceholder,
        }),
        HardBreak.extend({
          addKeyboardShortcuts() {
            return {
              "Shift-Enter": () => this.editor.chain().setHardBreak().scrollIntoView().run(),
            };
          },
        }),
      ],
      content: toEditorDoc(modelValue || ""),
      onUpdate: ({ editor: ed }) => {
        const text = getEditorText(ed);
        if (text !== (modelValue || "")) {
          onUpdateModelValue?.(text);
        }
      },
    });

    useEffect(() => {
      if (editor) {
        editorRef.current = editor;
      }
    }, [editor]);

    useEffect(() => {
      if (!editor) return;
      const next = modelValue || "";
      const current = getEditorText(editor);
      if (next === current) return;
      editor.commands.setContent(toEditorDoc(next), { emitUpdate: false });
      setCaretToEnd(editor);
    }, [modelValue, editor]);

    useEffect(() => {
      if (!editor) return;
      editor.view.updateState(editor.state);
    }, [resolvedPlaceholder, editor]);

    const sameFiles = (a: MessageFile[], b: MessageFile[]) => {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i += 1) {
        if (a[i].name !== b[i].name) return false;
        if ((a[i].path || "") !== (b[i].path || "")) return false;
        if ((a[i].mimeType || "") !== (b[i].mimeType || "")) return false;
      }
      return true;
    };

    useEffect(() => {
      if (sameFiles(externalFiles, filesHelper.selectedFiles)) return;
      filesHelper.selectedFiles = [...externalFiles];
    }, [externalFiles]);

    useEffect(() => {
      if (!sessionId) {
        onPendingSkillsChange?.([...skillsData.pendingSkills]);
      }
    }, [skillsData.pendingSkills]);

    useEffect(() => {
      if (sessionId) {
        if (skillsData.pendingSkills.length > 0) {
          void skillsData.applyPendingSkillsToConversation(sessionId);
        }
        onPendingSkillsChange?.([]);
        return;
      }
      onPendingSkillsChange?.([...skillsData.pendingSkills]);
    }, [sessionId]);

    function removeSkill(skillName: string) {
      void skillsData.deactivateSkill(skillName);
    }

    function handleKeydown(e: KeyboardEvent) {
      const isPlainTab = e.key === "Tab" && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey;
      if (isPlainTab && queueSubmitEnabled && !queueSubmitDisabled) {
        if (mentions.isSuggestionMenuOpen || mentions.shouldSuppressSubmit()) return;
        e.preventDefault();
        onQueueSubmit?.();
        return;
      }

      if (e.key !== "Enter" || e.shiftKey) return;
      if (mentions.isSuggestionMenuOpen || mentions.shouldSuppressSubmit()) return;
      if (submitDisabled) {
        e.preventDefault();
        return;
      }

      const isImeComposing = isComposing || e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229;
      if (isImeComposing) return;

      e.preventDefault();
      onSubmit?.();
    }

    function onDialogOpenChange(open: boolean) {
      if (!open) mentions.closeDialog();
    }

    function onPaste(event: ClipboardEvent) {
      void filesHelper.handlePaste(event.nativeEvent as any, true);

      const clipboardData = event.nativeEvent.clipboardData;
      if (clipboardData?.files && clipboardData.files.length > 0) return;

      const pastedUrl = extractPlainUrlFromClipboard(clipboardData);
      if (!pastedUrl) return;

      event.preventDefault();
      event.stopPropagation();
      editor?.chain().focus().insertContent(pastedUrl).run();
    }

    function onDragOver(event: DragEvent) {
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }
    }

    function insertWorkspaceReference(targetPath: string): boolean {
      if (!editor) return false;
      const referenceText = buildChatInputWorkspaceReferenceText(
        targetPath,
        workspacePath,
        targetPath.split(/[/\\]/).pop(),
      );
      if (!referenceText) return false;

      const { from, to } = editor.state.selection;
      const docSize = editor.state.doc.content.size;
      const before = from > 0 ? editor.state.doc.textBetween(Math.max(0, from - 1), from, "\n", "\n") : "";
      const after = to < docSize ? editor.state.doc.textBetween(to, Math.min(docSize, to + 1), "\n", "\n") : "";
      const prefix = before && !/\s/.test(before) ? " " : "";
      const suffix = after && /\s/.test(after) ? "" : " ";

      editor.chain().focus().insertContent(`${prefix}${referenceText}${suffix}`).run();
      return true;
    }

    function onDrop(event: DragEvent) {
      event.preventDefault();
      const workspaceItem = getChatInputWorkspaceItemDragData(event.dataTransfer);
      if (workspaceItem && insertWorkspaceReference(workspaceItem.path)) return;
      if (!event.dataTransfer?.files || event.dataTransfer.files.length === 0) return;
      void filesHelper.handleDrop(event.dataTransfer.files);
    }

    function triggerAttach() {
      filesHelper.openFilePicker();
    }

    function getPendingSkillsSnapshot(): string[] {
      return Array.from(new Set(skillsData.pendingSkills));
    }

    function focusInput() {
      editor?.chain().focus().scrollIntoView().run();
      if (editor) setCaretToEnd(editor);
    }

    function clearInput() {
      const ed = editorRef.current;
      if (!ed) return;
      ed.commands.setContent(toEditorDoc(""), { emitUpdate: false });
    }

    useImperativeHandle(
      ref,
      () => ({
        triggerAttach,
        insertWorkspaceReference,
        getPendingSkillsSnapshot,
        focusInput,
        clearInput,
      }),
      [editor],
    );

    return (
      <div
        data-testid="chat-input-box"
        className={`w-full overflow-hidden rounded-xl border bg-card/30 shadow-sm backdrop-blur-lg ${maxWidthClass}`}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          onChange={(e) => filesHelper.handleFileSelect(e as any)}
        />

        {activeSkillNames.length > 0 && (
          <div className="flex flex-wrap gap-2 px-4 pt-3">
            {activeSkillNames.map((skillName) => (
              <div
                key={skillName}
                className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs text-primary"
              >
                <Icon icon="lucide:sparkles" className="h-3 w-3 shrink-0" />
                <span className="truncate max-w-[160px]">{skillName}</span>
                <button
                  type="button"
                  className="inline-flex h-4 w-4 items-center justify-center rounded-sm hover:bg-primary/20"
                  onClick={() => removeSkill(skillName)}
                >
                  <Icon icon="lucide:x" className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {filesHelper.selectedFiles.length > 0 && (
          <div className={`flex flex-wrap gap-2 px-4 ${activeSkillNames.length > 0 ? "pt-2" : "pt-3"}`}>
            {filesHelper.selectedFiles.map((file: MessageFile, index: number) => (
              <ChatAttachmentItem
                key={file.path || `${file.name}-${index}`}
                file={file}
                removable
                onRemove={() => filesHelper.deleteFile(index)}
              />
            ))}
          </div>
        )}

        <div
          data-testid="chat-input-editor"
          className="chat-input-editor px-4 pt-4 pb-2 text-base sm:text-sm"
          onKeyDown={handleKeydown}
          onPasteCapture={onPaste}
        >
          {editor && (
            <EditorContent
              editor={editor}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => setIsComposing(false)}
            />
          )}
        </div>

        {footerLeft || toolbar ? (
          <div className="flex items-center justify-between gap-2 border-t border-border/40 px-3 py-2">
            <div className="flex min-w-0 items-center gap-1">{footerLeft}</div>
            <div className="flex shrink-0 items-center gap-1">{toolbar}</div>
          </div>
        ) : null}

        {dialogState && (
          <CommandInputDialog
            open={Boolean(dialogState)}
            title={dialogState?.title || ""}
            description={dialogState?.description}
            confirmText={dialogState?.confirmText}
            fields={dialogState?.fields || []}
            onUpdateOpen={onDialogOpenChange}
            onSubmit={mentions.submitDialog}
          />
        )}
      </div>
    );
  },
);

ChatInputBox.displayName = "ChatInputBox";

export default ChatInputBox;
