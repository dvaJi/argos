import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { ReactRenderer } from "@tiptap/react";
import type { Editor, Range } from "@tiptap/core";
import tippy from "tippy.js";
import { createSessionClient } from "#api/SessionClient";
import { createSkillClient } from "#api/SkillClient";
import { createWorkspaceClient } from "#api/WorkspaceClient";
import type { PromptListEntry, WorkspaceFileNode } from "@argos/shared/presenter";
import {
  mcpStore,
  loadPrompts,
  loadTools,
  getPrompt,
  isVisibleServerName,
  isPluginOwnedServerName,
} from "#/stores/mcp";
import { skillsStore, loadSkills } from "#/stores/skillsStore";
import { useStore } from "@tanstack/react-store";
import {
  buildChatInputWorkspaceReferenceText,
  resolveChatInputWorkspaceReferencePath,
} from "#/lib/chatInputWorkspaceReference";
import SuggestionList from "../mentions/SuggestionList";
import {
  buildCommandText,
  createManualCompactionSuggestion,
  filterSlashSuggestionItems,
  flattenPromptResultToText,
  resolveSlashSelectionAction,
  shouldShowManualCompactionCommand,
  sortSlashSuggestionItems,
  type AcpSessionCommand,
  type SlashSuggestionItem,
} from "../mentions/utils";

export interface MentionDialogState {
  mode: "command" | "prompt";
  title: string;
  description?: string;
  fields: Array<{
    name: string;
    label: string;
    description?: string;
    placeholder?: string;
    required?: boolean;
  }>;
  confirmText?: string;
}

export interface UseChatInputMentionsOptions {
  getEditor: () => Editor | null;
  workspacePath: string | null;
  sessionId: string | null;
  isAcpSession: boolean;
  isGenerating?: boolean;
  compactCommandDescription?: string;
  onCommandSubmit: (command: string) => void;
  onActivateSkill?: (skillName: string) => Promise<void> | void;
  onPendingSkillsChange?: (skills: string[]) => void;
}

interface FileSuggestionItem {
  id: string;
  category: "file";
  label: string;
  description?: string;
  payload: { path: string; insertText: string };
}

type SuggestionItem = FileSuggestionItem | SlashSuggestionItem;

const normalizeAcpCommands = (commands: unknown): AcpSessionCommand[] => {
  if (!Array.isArray(commands)) {
    return [];
  }

  return commands
    .map((command) => {
      if (!command || typeof command !== "object") return null;
      const record = command as Record<string, unknown>;
      const name = typeof record.name === "string" ? record.name.trim() : "";
      if (!name) return null;
      const description = typeof record.description === "string" ? record.description.trim() : "";
      const inputRecord =
        record.input && typeof record.input === "object" ? (record.input as Record<string, unknown>) : null;
      const hint = typeof inputRecord?.hint === "string" ? inputRecord.hint.trim() : "";

      return {
        name,
        description,
        input: hint ? { hint } : null,
      };
    })
    .filter((command): command is NonNullable<typeof command> => command !== null);
};

export function useChatInputMentions(options: UseChatInputMentionsOptions) {
  const workspaceClient = createWorkspaceClient();
  const sessionClient = createSessionClient();
  const skillClient = createSkillClient();

  const mcpTools = useStore(mcpStore, (s) => s.tools);
  const mcpPrompts = useStore(mcpStore, (s) => s.prompts);
  const skills = useStore(skillsStore, (s) => s.skills);

  const [acpCommands, setAcpCommands] = useState<AcpSessionCommand[]>([]);
  const acpCommandFetchSeqRef = useRef(0);
  const [pendingSkills, setPendingSkills] = useState<string[]>([]);
  const [isSuggestionMenuOpen, setIsSuggestionMenuOpen] = useState(false);
  const suppressSubmitUntilRef = useRef(0);
  const registeredWorkspacePathRef = useRef<string | null>(null);
  const unsubscribeAcpCommandsReadyRef = useRef<(() => void) | null>(null);

  const [dialogState, setDialogState] = useState<MentionDialogState | null>(null);
  const [pendingCommand, setPendingCommand] = useState<AcpSessionCommand | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<PromptListEntry | null>(null);

  const shouldSuppressSubmit = useCallback(() => Date.now() < suppressSubmitUntilRef.current, []);
  const markSuggestionSelected = useCallback(() => {
    suppressSubmitUntilRef.current = Date.now() + 180;
  }, []);

  const closeDialog = useCallback(() => {
    setDialogState(null);
    setPendingCommand(null);
    setPendingPrompt(null);
  }, []);

  const ensureWorkspaceRegistered = useCallback(async (): Promise<boolean> => {
    const workspacePath = options.workspacePath?.trim();
    if (!workspacePath) {
      return false;
    }

    if (registeredWorkspacePathRef.current === workspacePath) {
      return true;
    }

    try {
      await workspaceClient.registerWorkspace(workspacePath, options.isAcpSession ? "workdir" : "workspace");
      registeredWorkspacePathRef.current = workspacePath;
      return true;
    } catch (error) {
      console.warn("[ChatInputMentions] Failed to register workspace:", error);
      return false;
    }
  }, [options.workspacePath, options.isAcpSession]);

  const searchWorkspaceFiles = useCallback(
    async (query: string): Promise<FileSuggestionItem[]> => {
      const workspacePath = options.workspacePath?.trim();
      if (!workspacePath) {
        return [];
      }

      const registered = await ensureWorkspaceRegistered();
      if (!registered) {
        return [];
      }

      try {
        const searchQuery = query.trim() || "**/*";
        const result = (await workspaceClient.searchFiles(workspacePath, searchQuery)) ?? ([] as WorkspaceFileNode[]);

        return result.slice(0, 20).map((file) => {
          const displayPath = resolveChatInputWorkspaceReferencePath(file.path, workspacePath, file.name);
          return {
            id: `file:${file.path}`,
            category: "file" as const,
            label: displayPath,
            description: file.path,
            payload: {
              path: file.path,
              insertText: `${buildChatInputWorkspaceReferenceText(file.path, workspacePath, file.name)} `,
            },
          };
        });
      } catch (error) {
        console.warn("[ChatInputMentions] searchFiles failed:", error);
        return [];
      }
    },
    [options.workspacePath, ensureWorkspaceRegistered],
  );

  const visibleTools = useMemo(() => mcpTools.filter((tool) => isVisibleServerName(tool.server.name)), [mcpTools]);

  const visiblePrompts = useMemo(
    () => mcpPrompts.filter((prompt) => isVisibleServerName(prompt.client?.name)),
    [mcpPrompts],
  );

  const pluginTools = useMemo(() => mcpTools.filter((tool) => isPluginOwnedServerName(tool.server.name)), [mcpTools]);

  const slashItems = useMemo<SlashSuggestionItem[]>(() => {
    const items: SlashSuggestionItem[] = [];
    if (
      shouldShowManualCompactionCommand({
        sessionId: options.sessionId,
        isAcpSession: options.isAcpSession,
        isGenerating: options.isGenerating,
      })
    ) {
      items.push(createManualCompactionSuggestion(options.compactCommandDescription ?? ""));
    }

    for (const command of acpCommands) {
      items.push({
        id: `command:${command.name}`,
        category: "command",
        label: `/${command.name}`,
        description: command.description || command.input?.hint || "",
        payload: command,
      });
    }

    for (const skill of skills) {
      items.push({
        id: `skill:${skill.name}`,
        category: "skill",
        label: skill.name,
        description: skill.description,
        payload: { name: skill.name },
      });
    }

    for (const prompt of visiblePrompts) {
      items.push({
        id: `prompt:${prompt.client?.name || "unknown"}:${prompt.name}`,
        category: "prompt",
        label: prompt.name,
        description: prompt.description || "",
        payload: prompt,
      });
    }

    for (const tool of visibleTools) {
      items.push({
        id: `tool:${tool.server.name}:${tool.function.name ?? ""}`,
        category: "tool",
        label: tool.function.name ?? "",
        description: tool.function.description || "",
        payload: tool,
      });
    }

    for (const tool of pluginTools) {
      items.push({
        id: `plugin-tool:${tool.server.name}:${tool.function.name ?? ""}`,
        category: "tool",
        label: tool.function.name ?? "",
        description: tool.function.description || "",
        payload: tool,
      });
    }

    return sortSlashSuggestionItems(items);
  }, [
    acpCommands,
    skills,
    visiblePrompts,
    visibleTools,
    pluginTools,
    options.sessionId,
    options.isAcpSession,
    options.isGenerating,
    options.compactCommandDescription,
  ]);

  const refreshAcpCommands = useCallback(async () => {
    const sessionId = options.sessionId;
    const isAcpSession = options.isAcpSession;
    const fetchSeq = ++acpCommandFetchSeqRef.current;

    if (!sessionId || !isAcpSession) {
      setAcpCommands([]);
      return;
    }

    try {
      const commands = await sessionClient.getAcpSessionCommands(sessionId);
      if (fetchSeq !== acpCommandFetchSeqRef.current) {
        return;
      }
      if (options.sessionId !== sessionId || options.isAcpSession !== isAcpSession) {
        return;
      }
      setAcpCommands(normalizeAcpCommands(commands));
    } catch (error) {
      if (fetchSeq !== acpCommandFetchSeqRef.current) {
        return;
      }
      console.warn("[ChatInputMentions] Failed to fetch ACP session commands:", error);
      setAcpCommands([]);
    }
  }, [options.sessionId, options.isAcpSession]);

  const activateSkill = useCallback(
    async (skillName: string) => {
      if (!skillName) return;

      const sessionId = options.sessionId;
      if (!sessionId) {
        setPendingSkills((prev) => {
          if (prev.includes(skillName)) return prev;
          return [...prev, skillName];
        });
        options.onPendingSkillsChange?.([...pendingSkills, skillName]);
        return;
      }

      const activeSkills = await skillClient.getActiveSkills(sessionId);
      if (activeSkills.includes(skillName)) {
        return;
      }

      await skillClient.setActiveSkills(sessionId, [...activeSkills, skillName]);
    },
    [options.sessionId, options.onPendingSkillsChange, pendingSkills],
  );

  const insertPromptText = useCallback(
    async (prompt: PromptListEntry, args?: Record<string, string>) => {
      try {
        const result = await getPrompt(prompt, args);
        const text = flattenPromptResultToText(result);
        if (!text) return;
        options.getEditor()?.chain().focus().insertContent(` ${text} `).run();
      } catch (error) {
        console.error("[ChatInputMentions] Failed to resolve prompt content:", error);
      }
    },
    [options.getEditor],
  );

  const handleSlashSelection = useCallback(
    async (editor: Editor, range: Range, item: SlashSuggestionItem) => {
      const action = resolveSlashSelectionAction(item);

      if (action.kind === "send-command") {
        editor.chain().focus().insertContentAt(range, "").run();
        options.onCommandSubmit(action.command);
        return;
      }

      if (action.kind === "request-command-input") {
        editor.chain().focus().insertContentAt(range, "").run();
        setPendingCommand(action.command);
        setDialogState({
          mode: "command",
          title: `/${action.command.name}`,
          description: action.command.description || action.command.input?.hint || "",
          fields: [
            {
              name: "input",
              label: "Input",
              description: action.command.input?.hint,
              placeholder: action.command.input?.hint,
              required: true,
            },
          ],
          confirmText: "Send",
        });
        return;
      }

      if (action.kind === "activate-skill") {
        editor.chain().focus().insertContentAt(range, "").run();
        if (options.onActivateSkill) {
          await options.onActivateSkill(action.skillName);
          return;
        }
        await activateSkill(action.skillName);
        return;
      }

      if (action.kind === "insert-tool") {
        editor.chain().focus().insertContentAt(range, action.text).run();
        return;
      }

      if (action.kind === "request-prompt-args") {
        editor.chain().focus().insertContentAt(range, "").run();
        setPendingPrompt(action.prompt);
        setDialogState({
          mode: "prompt",
          title: `/${action.prompt.name}`,
          description: action.prompt.description || "Fill prompt arguments before insertion.",
          fields: (action.prompt.arguments ?? []).map((arg) => ({
            name: arg.name,
            label: arg.name,
            description: arg.description,
            placeholder: arg.description,
            required: Boolean(arg.required),
          })),
          confirmText: "Insert",
        });
        return;
      }

      editor.chain().focus().insertContentAt(range, "").run();
      await insertPromptText(action.prompt);
    },
    [options.onCommandSubmit, options.onActivateSkill, activateSkill, insertPromptText],
  );

  const submitDialog = useCallback(
    async (values: Record<string, string>) => {
      if (!dialogState) {
        return;
      }

      if (dialogState.mode === "command" && pendingCommand) {
        const input = values.input ?? "";
        options.onCommandSubmit(buildCommandText(pendingCommand.name, input));
        closeDialog();
        return;
      }

      if (dialogState.mode === "prompt" && pendingPrompt) {
        const args: Record<string, string> = {};
        for (const [key, value] of Object.entries(values)) {
          const normalized = value.trim();
          if (normalized) {
            args[key] = normalized;
          }
        }
        await insertPromptText(pendingPrompt, args);
        closeDialog();
        return;
      }

      closeDialog();
    },
    [dialogState, pendingCommand, pendingPrompt, options.onCommandSubmit, insertPromptText, closeDialog],
  );

  const filterSlashItems = useCallback(
    (query: string): SlashSuggestionItem[] => {
      return filterSlashSuggestionItems(slashItems, query);
    },
    [slashItems],
  );

  const createRenderer = useCallback(() => {
    let component: ReactRenderer | null = null;
    let popup: ReturnType<typeof tippy> | null = null;

    return {
      onStart: (props: any) => {
        setIsSuggestionMenuOpen(true);
        component = new ReactRenderer(SuggestionList, {
          editor: props.editor,
          props: {
            items: props.items,
            query: props.query,
            command: (item: SuggestionItem) => props.command(item),
          },
        });

        if (!props.clientRect) {
          return;
        }

        popup = (tippy as any)("body", {
          getReferenceClientRect: props.clientRect,
          appendTo: () => document.body,
          content: component.element,
          showOnCreate: true,
          interactive: true,
          trigger: "manual",
          placement: "top-start",
          zIndex: 90,
        });
      },
      onUpdate: (props: any) => {
        component?.updateProps({
          items: props.items,
          query: props.query,
          command: (item: SuggestionItem) => props.command(item),
        });

        if (!props.clientRect || !popup?.[0]) {
          return;
        }

        popup[0].setProps({ getReferenceClientRect: props.clientRect });
      },
      onKeyDown: (props: any) => {
        if (!popup?.[0]) {
          return false;
        }

        if (props.event.key === "Escape") {
          popup[0].hide();
          return true;
        }

        return (component?.ref as any)?.onKeyDown(props) ?? false;
      },
      onExit: () => {
        setIsSuggestionMenuOpen(false);
        popup?.[0]?.destroy();
        popup = null;
        component?.destroy();
        component = null;
      },
    };
  }, []);

  const atSuggestion = useMemo(
    () => ({
      char: "@",
      allowedPrefixes: null,
      items: async ({ query }: { query: string }) => {
        return await searchWorkspaceFiles(query);
      },
      command: ({ editor, range, props }: { editor: Editor; range: Range; props: FileSuggestionItem }) => {
        markSuggestionSelected();
        editor.chain().focus().insertContentAt(range, props.payload.insertText).run();
      },
      render: createRenderer,
    }),
    [searchWorkspaceFiles, markSuggestionSelected, createRenderer],
  );

  const slashSuggestion = useMemo(
    () => ({
      char: "/",
      allowedPrefixes: null,
      items: ({ query }: { query: string }) => filterSlashItems(query),
      command: ({ editor, range, props }: { editor: Editor; range: Range; props: SlashSuggestionItem }) => {
        markSuggestionSelected();
        void handleSlashSelection(editor, range, props);
      },
      render: createRenderer,
    }),
    [filterSlashItems, handleSlashSelection, markSuggestionSelected, createRenderer],
  );

  useEffect(() => {
    const workspacePath = options.workspacePath;
    if (!workspacePath || workspacePath !== registeredWorkspacePathRef.current) {
      registeredWorkspacePathRef.current = null;
    }
  }, [options.workspacePath]);

  useEffect(() => {
    if (options.sessionId) {
      setPendingSkills([]);
    }
  }, [options.sessionId]);

  useEffect(() => {
    void refreshAcpCommands();
  }, [options.sessionId, options.isAcpSession, refreshAcpCommands]);

  useEffect(() => {
    if (skills.length === 0) {
      void loadSkills();
    }
    void loadPrompts();
    void loadTools();

    const handleAcpCommandsReady = (payload?: Record<string, unknown>) => {
      if (!payload) return;
      const conversationId = typeof payload.conversationId === "string" ? payload.conversationId : "";
      if (!conversationId || conversationId !== options.sessionId) {
        return;
      }
      setAcpCommands(normalizeAcpCommands(payload.commands));
    };

    unsubscribeAcpCommandsReadyRef.current = sessionClient.onAcpCommandsReady(handleAcpCommandsReady);

    return () => {
      unsubscribeAcpCommandsReadyRef.current?.();
      unsubscribeAcpCommandsReadyRef.current = null;
    };
  }, []);

  return {
    atSuggestion,
    slashSuggestion,
    isSuggestionMenuOpen,
    shouldSuppressSubmit,
    pendingSkills,
    dialogState,
    submitDialog,
    closeDialog,
  };
}
