import { useEffect, useRef, useState, type RefObject } from "react";
import { useStore } from "@tanstack/react-store";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#shadcn/components/ui/dropdown-menu";
import ThreadComposer, { type ThreadComposerHandle } from "#/components/chat/ThreadComposer";
import ChatStatusBar from "#/components/chat/ChatStatusBar";
import RecentSessionsStrip from "#/components/chat/RecentSessionsStrip";
import WorktreeSelector from "#/components/WorktreeSelector";
import { emptyWorktreeDraft, type WorktreeDraftConfig } from "#/components/worktreeConfig";
import { BrandWordmark } from "#/components/brand/BrandWordmark";
import { FolderPickerDialog } from "#/components/FolderPicker";
import AgentSwitcher from "#/components/threads/AgentSwitcher";
import { useToast } from "#/components/use-toast";
import GuidedOnboardingOverlay from "#/components/onboarding/GuidedOnboardingOverlay";
import { useGuidedOnboardingStep } from "#/composables/useGuidedOnboardingStep";
import { useModelAwareAttachments, type ChatModelSelectionRef } from "#/composables/chat/useModelAwareAttachments";
import { ENTRANCE_CLASS } from "#/lib/pageMotion";
import { resolveEffectiveAgent } from "#/lib/effectiveAgent";
import { projectStore, selectProject, selectProjectFolder, swapProjectForAgent } from "#/stores/ui/project";
import { sessionStore, createSession, selectSession, sendMessage, fetchSessions } from "#/stores/ui/session";
import { agentStore, selectedAgent as getSelectedAgent, inferAgentType } from "#/stores/ui/agent";
import { modelStore, initialize, getChatSelectableModelGroups } from "#/stores/modelStore";
import { draftStore, toGenerationSettings as getToGenerationSettings } from "#/stores/ui/draft";
import { unsettleSession } from "#/stores/ui/threadSidebar";
import { createConfigClient } from "#api/ConfigClient";
import { createFileClient } from "#api/FileClient";
import { createSessionClient } from "#api/SessionClient";
import { createWorkspaceClient } from "#api/WorkspaceClient";
import { createSettingsClient } from "#api/SettingsClient";
import { persistGuidedOnboardingResumeIntent } from "#/lib/onboardingResume";
import { resolveGuidedOnboardingStepTarget } from "@argos/shared/guidedOnboarding";
import { normalizeArgosSubagentConfig } from "@argos/shared/lib/argosSubagents";
import { resolvePreferredChatModel, type ChatModelSelection } from "#/lib/chatModelSelection";
import { scheduleStartupDeferredTask } from "#/lib/startupDeferred";
import { isManualCompactionCommand } from "#/components/chat/mentions/utils";
import { cancelChatInputHeroFlight, prepareChatInputHeroFlight } from "#/lib/chatInputHero";
import { useRuntimeConnectionState } from "#/composables/useRuntimeConnectionState";
import { useWorkspaceStore } from "#/stores/ui/workspace";
import type { ArgosAgentConfig, MessageFile } from "@argos/shared/types/agent-interface";
const configClient = createConfigClient();
const fileClient = createFileClient();
const sessionClient = createSessionClient();
const workspaceClient = createWorkspaceClient();
const settingsClient = createSettingsClient();
const PROJECT_MENU_LIMIT = 8;

/** Creates the isolated worktree for a submission (module-level: compiler-safe try/catch). */
async function createSubmissionWorktree(input: {
  workspacePath: string;
  baseBranch: string;
  fromRemote: boolean;
  branchName?: string;
}): Promise<string> {
  const worktree = await workspaceClient.gitCreateWorktree(input);
  return worktree.worktreePath;
}

/** Best-effort cleanup of a worktree created for a submission that failed. */
async function abandonSubmissionWorktree(input: { workspacePath: string; worktreePath: string }): Promise<void> {
  await workspaceClient
    .gitRemoveWorktree({
      ...input,
      force: true,
      deleteBranch: true,
    })
    .catch(() => {});
}

/** Ensures an ACP draft session bound to the worktree directory (compiler-safe throw). */
async function ensureWorktreeAcpDraft(input: {
  agentId: string;
  projectDir: string;
  permissionMode: "default" | "full_access";
}): Promise<string> {
  const draft = await sessionClient.ensureAcpDraftSession(input);
  const draftSessionId = typeof draft?.id === "string" ? draft.id.trim() : "";
  if (!draftSessionId) {
    throw new Error("Failed to create ACP draft session for the worktree.");
  }
  return draftSessionId;
}

/**
 * The single "start a thread" surface, rendered for the `newThread` route:
 *  - no agents enabled → empty state with a shortcut to agent settings;
 *  - no agent selected yet → welcome state (agent pill, headline, and the
 *    recent-threads list stacked in one centered column, previously
 *    `AgentWelcomePage`);
 *  - agent selected → centered composer.
 *
 * All three states share one composer (`ThreadComposer`: attach + model /
 * effort / mode chips on the footer's left, send cluster on the right) and one
 * context row below it (machine / project / worktree).
 */
const normalizeProjectPath = (value: string | null | undefined) => {
  const n = value?.trim();
  return n || null;
};
function nextTick(fn: () => void) {
  Promise.resolve().then(fn);
}
async function resolveArgosAgentConfig(agentId: string): Promise<ArgosAgentConfig> {
  const config = await configClient.resolveArgosAgentConfig(agentId);
  if (config) return config;
  const systemPrompt = await configClient.getSetting("default_system_prompt");
  return normalizeArgosSubagentConfig({
    defaultModelPreset: undefined,
    systemPrompt: typeof systemPrompt === "string" ? systemPrompt : "",
    permissionMode: "full_access",
    disabledAgentTools: [],
  });
}

/** Derives the agent/project/worktree view state for the new-thread page (module-level, pure over snapshots). */
function deriveNewThreadContext(input: {
  agentState: typeof agentStore.state;
  sessionState: typeof sessionStore.state;
  projectState: typeof projectStore.state;
  selectedProjectDirectoryStatus: "none" | "checking" | "valid" | "invalid";
}) {
  const { agentState, sessionState, projectState, selectedProjectDirectoryStatus } = input;
  const availableAgents = Array.isArray(agentState.agents) ? agentState.agents : [];
  const enabledAgents = availableAgents.filter((a) => a.enabled);
  const noAgentsEnabled = enabledAgents.length === 0;
  const isWelcomeState = agentState.selectedAgentId === null;
  const selectedAgentFromStore = getSelectedAgent();
  const resolveAgentType = (agentId: string | null | undefined): "argos" | "acp" => {
    const sel = selectedAgentFromStore?.id === agentId ? selectedAgentFromStore : null;
    const explicitType = inferAgentType(agentId, availableAgents) ?? (sel ? (sel.agentType ?? sel.type) : null);
    if (explicitType === "argos" || explicitType === "acp") return explicitType;
    return "argos";
  };

  // Same priority as `AgentSwitcher`: explicit selection → active session's
  // agent → first enabled Argos agent. Drives the welcome lane and is the
  // submission target when the user sends without picking an agent.
  const activeSessionAgentId =
    sessionState.sessions.find((s) => s.id === sessionState.activeSessionId)?.agentId ?? null;
  const effectiveAgent = resolveEffectiveAgent({
    agents: agentState.agents,
    selectedAgentId: agentState.selectedAgentId,
    activeSessionAgentId,
  });
  const selectedAgent = (() => {
    const id = agentState.selectedAgentId ?? effectiveAgent?.agent.id ?? "argos";
    const matched = availableAgents.find((a) => a.id === id);
    if (matched) return matched;
    if (selectedAgentFromStore?.id === id) return selectedAgentFromStore;
    return {
      id,
      type: resolveAgentType(id),
    };
  })();
  const isAcpSelectedAgent = selectedAgent.type === "acp";
  const hasExplicitNoProjectSelection =
    projectState.selectionSource === "manual" && !projectState.selectedProjectPath?.trim();
  const selectedProjectPath = normalizeProjectPath(projectState.selectedProjectPath);
  const selectedProjectName = (() => {
    const selProj = projectState.projects.find((p) => p.path === projectState.selectedProjectPath);
    if (selProj?.name) return selProj.name;
    return hasExplicitNoProjectSelection ? "No Project" : "Select Project";
  })();
  const canClearProjectSelection = Boolean(projectState.selectedProjectPath?.trim());
  const selectedProjectDirectoryInvalid = selectedProjectDirectoryStatus === "invalid";
  const selectedProjectUnavailableTooltip = selectedProjectPath
    ? `Workspace path unavailable: ${selectedProjectPath}`
    : "";
  const isSelectedInvalidProjectPath = (projectPath: string | null | undefined): boolean =>
    selectedProjectDirectoryInvalid && normalizeProjectPath(projectPath) === selectedProjectPath;
  const isAcpWorkdirMissing = isAcpSelectedAgent && !selectedProjectPath;
  const isAcpWorkdirInvalid = isAcpSelectedAgent && Boolean(selectedProjectPath) && selectedProjectDirectoryInvalid;
  const isAcpWorkdirChecking =
    isAcpSelectedAgent && Boolean(selectedProjectPath) && selectedProjectDirectoryStatus === "checking";
  const isAcpWorkdirUnavailable = isAcpWorkdirMissing || isAcpWorkdirInvalid || isAcpWorkdirChecking;
  return {
    availableAgents,
    noAgentsEnabled,
    isWelcomeState,
    effectiveAgent,
    selectedAgent,
    isAcpSelectedAgent,
    selectedProjectPath,
    selectedProjectName,
    canClearProjectSelection,
    selectedProjectDirectoryInvalid,
    selectedProjectUnavailableTooltip,
    isSelectedInvalidProjectPath,
    isAcpWorkdirMissing,
    isAcpWorkdirUnavailable,
  };
}

/** Resolves the model used for submissions (module-level factory over store snapshots). */
function createModelResolution(input: {
  modelState: typeof modelStore.state;
  draftState: typeof draftStore.state;
  isAcpSelectedAgent: boolean;
  selectedAgentId: string;
  acpDraftModelSelection: ChatModelSelectionRef | null;
}) {
  const { modelState, draftState, isAcpSelectedAgent, selectedAgentId, acpDraftModelSelection } = input;
  const ensureEnabledModelsReady = async (): Promise<boolean> => {
    if (modelState.initialized) return true;
    try {
      await initialize();
      return true;
    } catch (error) {
      console.warn("[NewThreadPage] Failed to initialize enabled models:", error);
      return false;
    }
  };
  const resolveModel = async (): Promise<ChatModelSelectionRef | null> => {
    const ready = await ensureEnabledModelsReady();
    if (!ready) return null;
    const [preferredModel, defaultModel] = await Promise.all([
      configClient.getSetting("preferredModel") as Promise<ChatModelSelection | undefined>,
      configClient.getSetting("defaultModel") as Promise<ChatModelSelection | undefined>,
    ]);
    const resolvedModel = resolvePreferredChatModel({
      modelGroups: getChatSelectableModelGroups(),
      selections: [
        draftState.providerId && draftState.modelId
          ? {
              providerId: draftState.providerId,
              modelId: draftState.modelId,
            }
          : null,
        preferredModel,
        defaultModel,
      ],
    });
    if (resolvedModel)
      return {
        providerId: resolvedModel.providerId,
        modelId: resolvedModel.model.id,
      };
    return null;
  };
  const resolveSubmissionModelSelection = async (): Promise<ChatModelSelectionRef | null> => {
    if (isAcpSelectedAgent) {
      if (acpDraftModelSelection) return acpDraftModelSelection;
      const agentId = selectedAgentId?.trim();
      return agentId
        ? {
            providerId: "acp",
            modelId: agentId,
          }
        : null;
    }
    return await resolveModel();
  };
  return { resolveModel, resolveSubmissionModelSelection };
}

type ThreadSubmissionInput = {
  toast: ReturnType<typeof useToast>["toast"];
  message: string;
  attachedFiles: MessageFile[];
  setMessage: (message: string) => void;
  setAttachedFiles: (files: MessageFile[]) => void;
  prepareFiles: (files: MessageFile[]) => Promise<MessageFile[]>;
  isAcpWorkdirUnavailable: boolean;
  isDaemonConnected: boolean;
  isAcpSelectedAgent: boolean;
  worktreeDraft: WorktreeDraftConfig;
  isCreatingWorktree: boolean;
  setIsCreatingWorktree: (value: boolean) => void;
  selectedProjectPath: string | null;
  rawSelectedProjectPath: string | null;
  acpDraftSessionId: string | null;
  draftState: typeof draftStore.state;
  resolveModel: () => Promise<ChatModelSelectionRef | null>;
  agentId: string;
  firstChatGuideHostRef: RefObject<HTMLDivElement | null>;
  composerRef: RefObject<ThreadComposerHandle | null>;
  pendingSkillsRef: RefObject<string[]>;
};

/** Worktree/ACP/plain submission flow for the new-thread composer. */
function useThreadSubmission(input: ThreadSubmissionInput) {
  const {
    toast,
    message,
    attachedFiles,
    setMessage,
    setAttachedFiles,
    prepareFiles,
    isAcpWorkdirUnavailable,
    isDaemonConnected,
    isAcpSelectedAgent,
    worktreeDraft,
    isCreatingWorktree,
    setIsCreatingWorktree,
    selectedProjectPath,
    rawSelectedProjectPath,
    acpDraftSessionId,
    draftState,
    resolveModel,
    agentId,
    firstChatGuideHostRef,
    composerRef,
    pendingSkillsRef,
  } = input;
  const shouldIgnoreManualCompactionDraft = (text: string): boolean => {
    return !isAcpSelectedAgent && isManualCompactionCommand(text);
  };
  const submitText = async (text: string, files: MessageFile[]) => {
    if (!text.trim()) return;
    if (isAcpWorkdirUnavailable || !isDaemonConnected) return;
    const chatInputBoxEl = firstChatGuideHostRef.current?.querySelector(
      '[data-testid="chat-input-box"]',
    ) as HTMLElement | null;
    const preparedHeroFlight = prepareChatInputHeroFlight(chatInputBoxEl);
    const isAcp = isAcpSelectedAgent;

    // If any step after worktree creation fails (or bails early), remove
    // the checkout so failed submissions never orphan worktrees/branches.
    // Declared before the outer try so the catch path can clean it up.
    let createdWorktree: {
      repoPath: string;
      worktreePath: string;
    } | null = null;
    const abandonCreatedWorktree = async (): Promise<void> => {
      if (!createdWorktree) return;
      const orphan = createdWorktree;
      createdWorktree = null;
      await abandonSubmissionWorktree({
        workspacePath: orphan.repoPath,
        worktreePath: orphan.worktreePath,
      });
    };
    try {
      // Worktree mode: create the isolated checkout from the selected base
      // branch FIRST, then bind the session to it. The base repo checkout is
      // never touched (server-side `git worktree add -b <branch> <path> <ref>`).
      let sessionProjectDir = rawSelectedProjectPath ?? undefined;
      if (worktreeDraft.reuseWorktreePath) {
        sessionProjectDir = worktreeDraft.reuseWorktreePath;
      } else if (worktreeDraft.enabled) {
        if (isCreatingWorktree) return;
        const repoPath = rawSelectedProjectPath;
        if (!repoPath || !worktreeDraft.baseBranch) {
          toast({
            title: "Worktree Not Configured",
            description: "Select a base branch for the worktree, or turn worktree mode off.",
            variant: "destructive",
          });
          if (preparedHeroFlight) cancelChatInputHeroFlight();
          return;
        }
        setIsCreatingWorktree(true);
        const created = await createSubmissionWorktree({
          workspacePath: repoPath,
          baseBranch: worktreeDraft.baseBranch,
          fromRemote: worktreeDraft.fromRemote,
          branchName: worktreeDraft.branchName.trim() || undefined,
        })
          .then((worktreePath) => ({
            repoPath: repoPath as string,
            worktreePath,
          }))
          .catch((error: unknown) => {
            toast({
              title: "Failed to Create Worktree",
              description: error instanceof Error ? error.message : String(error),
              variant: "destructive",
            });
            return null;
          });
        setIsCreatingWorktree(false);
        if (!created) {
          if (preparedHeroFlight) cancelChatInputHeroFlight();
          return;
        }
        createdWorktree = created;
        sessionProjectDir = created.worktreePath;
      }
      if (isAcp && acpDraftSessionId && !createdWorktree && !worktreeDraft.reuseWorktreePath) {
        await selectSession(acpDraftSessionId);
        await sendMessage(acpDraftSessionId, {
          text,
          files,
        });
        unsettleSession(acpDraftSessionId);
        void fetchSessions();
        return;
      }
      let providerId: string | undefined;
      let modelId: string | undefined;
      if (isAcp) {
        providerId = "acp";
        modelId = agentId;
      } else {
        const resolved = await resolveModel();
        if (!resolved) {
          console.error("No model available. Please configure a provider and model in settings.");
          toast({
            title: "No model available",
            description: "Configure a provider and model in Settings → Models.",
            variant: "destructive",
          });
          await abandonCreatedWorktree();
          if (preparedHeroFlight) cancelChatInputHeroFlight();
          return;
        }
        providerId = resolved.providerId;
        modelId = resolved.modelId;
      }
      if (isAcp && sessionProjectDir) {
        // ACP drafts are keyed per agent+projectDir: in worktree mode this
        // mints a fresh draft bound to the worktree directory, so the agent
        // spawns with cwd = worktree. Throws propagate to the outer catch,
        // which removes the orphaned worktree.
        const draftSessionId = await ensureWorktreeAcpDraft({
          agentId,
          projectDir: sessionProjectDir,
          permissionMode: draftState.permissionMode,
        });
        await selectSession(draftSessionId);
        await sendMessage(draftSessionId, {
          text,
          files,
        });
        createdWorktree = null; // submission succeeded; keep the worktree
        void fetchSessions();
        return;
      }
      const pendingSkillsSnapshot = composerRef.current?.getPendingSkillsSnapshot() ?? pendingSkillsRef.current;
      const dedupedPendingSkills = Array.from(new Set(pendingSkillsSnapshot));
      await createSession({
        message: text,
        files,
        projectDir: sessionProjectDir,
        agentId,
        providerId,
        modelId,
        permissionMode: draftState.permissionMode,
        disabledAgentTools: isAcp ? undefined : [...draftState.disabledAgentTools],
        subagentEnabled: isAcp ? false : draftState.subagentEnabled,
        generationSettings: getToGenerationSettings?.() ?? {},
        activeSkills: dedupedPendingSkills.length > 0 ? dedupedPendingSkills : undefined,
      });
      createdWorktree = null; // submission succeeded; keep the worktree
      // Mark the freshly-created thread as Active so it surfaces in the
      // sidebar's active row instead of dropping straight into Settled.
      const newId = sessionStore.state.activeSessionId;
      if (newId) unsettleSession(newId);
    } catch (error) {
      await abandonCreatedWorktree();
      if (preparedHeroFlight) cancelChatInputHeroFlight();
      throw error;
    }
  };
  const onSubmit = async () => {
    if (isAcpWorkdirUnavailable || !isDaemonConnected) return;
    const text = message.trim();
    if (!text) return;
    if (shouldIgnoreManualCompactionDraft(text)) return;
    const files = await prepareFiles([...attachedFiles]);
    try {
      await submitText(text, files);
      setMessage("");
      setAttachedFiles([]);
    } catch (e) {
      console.error("[NewThreadPage] submit failed:", e);
    }
  };
  const onCommandSubmit = async (command: string) => {
    if (isAcpWorkdirUnavailable || !isDaemonConnected) return;
    const text = command.trim();
    if (!text) return;
    if (shouldIgnoreManualCompactionDraft(text)) return;
    const files = await prepareFiles([...attachedFiles]);
    try {
      await submitText(text, files);
      setAttachedFiles([]);
    } catch (e) {
      console.error("[NewThreadPage] submit failed:", e);
    }
  };
  return { submitText, onSubmit, onCommandSubmit };
}

/** Keeps an ACP draft session in sync with the selected agent + project (module-level hook). */
function useAcpDraftSession(input: {
  isAcpSelectedAgent: boolean;
  selectedAgentId: string;
  selectedProjectPath: string | null;
  selectedProjectDirectoryStatus: "none" | "checking" | "valid" | "invalid";
  permissionMode: "default" | "full_access";
  currentAgentId: string;
  currentProjectDir: string;
}) {
  const {
    isAcpSelectedAgent,
    selectedAgentId,
    selectedProjectPath,
    selectedProjectDirectoryStatus,
    permissionMode,
    currentAgentId,
    currentProjectDir,
  } = input;
  const [acpDraftSessionId, setAcpDraftSessionId] = useState<string | null>(null);
  const [acpDraftModelSelection, setAcpDraftModelSelection] = useState<ChatModelSelectionRef | null>(null);
  const lastAcpDraftKeyRef = useRef<string | null>(null);
  const acpDraftRequestSeqRef = useRef(0);
  const cancelEnsureDraftTaskRef = useRef<(() => void) | null>(null);
  const ensureAcpDraftSession = async (agentId: string, projectPath: string) => {
    const projectDir = projectPath.trim();
    if (!projectDir) return;
    const draftKey = `${agentId}::${projectDir}`;
    if (lastAcpDraftKeyRef.current === draftKey && acpDraftSessionId) return;
    const requestSeq = ++acpDraftRequestSeqRef.current;
    try {
      const session = await sessionClient.ensureAcpDraftSession({
        agentId,
        projectDir,
        permissionMode,
      });
      if (requestSeq !== acpDraftRequestSeqRef.current) return;
      // Compare against the *submission* agent (selected or effective fallback),
      // not `selectedAgentId` — in the welcome state there is no explicit
      // selection yet but the draft still targets the effective agent.
      if (currentAgentId !== agentId || currentProjectDir !== projectDir) return;
      const sessionId = typeof session?.id === "string" ? session.id.trim() : "";
      if (!sessionId) {
        setAcpDraftSessionId(null);
        setAcpDraftModelSelection(null);
        lastAcpDraftKeyRef.current = null;
        return;
      }
      setAcpDraftSessionId(sessionId);
      setAcpDraftModelSelection(
        typeof session.providerId === "string" &&
          session.providerId.trim() &&
          typeof session.modelId === "string" &&
          session.modelId.trim()
          ? {
              providerId: session.providerId.trim(),
              modelId: session.modelId.trim(),
            }
          : {
              providerId: "acp",
              modelId: agentId,
            },
      );
      lastAcpDraftKeyRef.current = draftKey;
    } catch (error) {
      if (requestSeq !== acpDraftRequestSeqRef.current) return;
      console.warn("[NewThreadPage] Failed to ensure ACP draft session:", error);
      setAcpDraftSessionId(null);
      setAcpDraftModelSelection(null);
      lastAcpDraftKeyRef.current = null;
    }
  };
  useEffect(() => {
    void Promise.resolve().then(() => {
      if (!isAcpSelectedAgent || !selectedProjectPath || selectedProjectDirectoryStatus !== "valid") {
        setAcpDraftSessionId(null);
        setAcpDraftModelSelection(null);
        lastAcpDraftKeyRef.current = null;
        return;
      }
      const agentId = selectedAgentId;
      const projectPath = selectedProjectPath;
      const draftKey = `${agentId}::${projectPath}`;
      if (lastAcpDraftKeyRef.current === draftKey && acpDraftSessionId) return;
      acpDraftRequestSeqRef.current += 1;
      cancelEnsureDraftTaskRef.current?.();
      cancelEnsureDraftTaskRef.current = null;
      if (lastAcpDraftKeyRef.current !== draftKey) {
        setAcpDraftSessionId(null);
        setAcpDraftModelSelection(null);
        lastAcpDraftKeyRef.current = null;
      }
      cancelEnsureDraftTaskRef.current = scheduleStartupDeferredTask(async () => {
        await ensureAcpDraftSession(agentId, projectPath);
      });
    });
  }, [
    selectedAgentId,
    selectedProjectPath,
    selectedProjectDirectoryStatus,
    isAcpSelectedAgent,
    acpDraftSessionId,
    ensureAcpDraftSession,
  ]);
  useEffect(() => {
    return () => {
      cancelEnsureDraftTaskRef.current?.();
      cancelEnsureDraftTaskRef.current = null;
    };
  }, []);
  return { acpDraftSessionId, acpDraftModelSelection };
}

/** Applies per-agent draft defaults whenever the agent context changes (module-level hook). */
function useAgentDraftDefaults(input: { agentId: string; agentType: string }) {
  const { agentId, agentType } = input;
  const projectStateRef = useRef(projectStore.state);
  useEffect(() => {
    projectStateRef.current = projectStore.state;
  });
  const currentDraftDefaultsTaskRef = useRef<Promise<void> | null>(null);
  useEffect(() => {
    const applyDefaults = async () => {
      const projectStateNow = projectStateRef.current;
      const globalDefault = normalizeProjectPath(projectStateNow.defaultProjectPath);
      const currentProject = normalizeProjectPath(projectStateNow.selectedProjectPath);
      draftStore.setState((s) => ({
        ...s,
        agentId,
        providerId: undefined,
        modelId: undefined,
        permissionMode: "full_access",
        disabledAgentTools: [],
        subagentEnabled: false,
        systemPrompt: undefined,
        temperature: undefined,
        topP: undefined,
        contextLength: undefined,
        maxTokens: undefined,
        timeout: undefined,
        thinkingBudget: undefined,
        reasoningEffort: undefined,
        reasoningVisibility: undefined,
        verbosity: undefined,
        forceInterleavedThinkingCompat: undefined,
        imageGeneration: undefined,
        videoGeneration: undefined,
      }));
      if (agentType === "acp") {
        const resolvedPath = currentProject ?? globalDefault;
        if (!currentProject && globalDefault) selectProject(globalDefault, "default");
        draftStore.setState((s) => ({
          ...s,
          projectDir: resolvedPath ?? undefined,
          providerId: "acp",
          modelId: agentId,
          permissionMode: "full_access",
          disabledAgentTools: [],
          subagentEnabled: false,
        }));
        return;
      }
      let config: ArgosAgentConfig | null = null;
      try {
        config = await resolveArgosAgentConfig(agentId);
      } catch (error) {
        // Keep the composer usable when the config lookup fails: fall back to
        // defaults below instead of wedging the draft at "Select model" with a
        // dead send button (unhandled rejection).
        console.warn("[NewThreadPage] resolveArgosAgentConfig failed, using draft defaults:", error);
      }
      if (!config) {
        const systemPrompt = await configClient.getSetting("default_system_prompt").catch(() => undefined);
        config = normalizeArgosSubagentConfig({
          defaultModelPreset: undefined,
          systemPrompt: typeof systemPrompt === "string" ? systemPrompt : "",
          permissionMode: "full_access",
          disabledAgentTools: [],
        });
      }
      const agentDefault = normalizeProjectPath(config.defaultProjectPath);
      const resolvedPath = agentDefault ?? currentProject ?? globalDefault;
      if (agentDefault) {
        selectProject(agentDefault, agentDefault === globalDefault ? "default" : "manual");
      } else if (!currentProject && globalDefault) {
        selectProject(globalDefault, "default");
      }
      draftStore.setState((s) => ({
        ...s,
        projectDir: resolvedPath ?? undefined,
        providerId: config.defaultModelPreset?.providerId,
        modelId: config.defaultModelPreset?.modelId,
        permissionMode: config.permissionMode === "default" ? "default" : "full_access",
        disabledAgentTools: [...(config.disabledAgentTools ?? [])],
        subagentEnabled: config.subagentEnabled === true,
        systemPrompt: config.systemPrompt ?? "",
      }));
    };
    const task = applyDefaults().finally(() => {
      if (currentDraftDefaultsTaskRef.current === task) {
        currentDraftDefaultsTaskRef.current = null;
      }
    });
    currentDraftDefaultsTaskRef.current = task;
  }, [agentId, agentType]);
}

/** Guided-onboarding targets, active step, and step actions for the new-thread surface (module-level hook). */
function useNewThreadGuides(input: {
  firstChatGuideHostRef: RefObject<HTMLDivElement | null>;
  isAcpSelectedAgent: boolean;
  isWelcomeState: boolean;
  selectedAgentType: string;
}) {
  const { firstChatGuideHostRef, isAcpSelectedAgent, isWelcomeState, selectedAgentType } = input;
  const switchAgentGuide = useGuidedOnboardingStep("switch-agent");
  const switchModelGuide = useGuidedOnboardingStep("switch-model");
  const firstChatGuide = useGuidedOnboardingStep("first-chat");
  const [guideRootEl, setGuideRootEl] = useState<HTMLDivElement | null>(null);
  const [guideTargets, setGuideTargets] = useState<{
    agent: HTMLDivElement | null;
    model: HTMLDivElement | null;
    firstChat: HTMLDivElement | null;
  }>({
    agent: null,
    model: null,
    firstChat: null,
  });
  const [isCompletingSwitchAgentGuide, setIsCompletingSwitchAgentGuide] = useState(false);
  // Liveness flag flipped by the auto-complete effect; post-await state writes
  // are skipped once the effect is torn down so unmounted completions never
  // write state.
  const switchAgentStepLiveRef = useRef(false);
  const syncGuideTargets = (_context?: string) => {
    if (typeof document === "undefined") return;
    const agent =
      (document.querySelector(
        '[data-testid="sidebar-agent-button"][data-agent-id="argos"]',
      ) as HTMLDivElement | null) ??
      (document.querySelector(
        '[data-testid="sidebar-agent-button"][data-agent-type="argos"]',
      ) as HTMLDivElement | null);
    const model = document.querySelector('[data-testid="app-model-switcher"]') as HTMLDivElement | null;
    const firstChat =
      (firstChatGuideHostRef.current?.querySelector('[data-testid="chat-input-box"]') as HTMLDivElement | null) ??
      firstChatGuideHostRef.current;
    setGuideTargets({
      agent,
      model,
      firstChat,
    });
  };
  useEffect(() => {
    const sync = () => {
      void nextTick(syncGuideTargets);
    };
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, [syncGuideTargets]);

  // Re-measure guide targets whenever guide visibility or the agent context
  // changes — both swap which DOM nodes are valid targets. The context is passed
  // through to make the re-measure trigger explicit.
  const guideSyncContext = `${switchAgentGuide.showGuide}|${switchModelGuide.showGuide}|${firstChatGuide.showGuide}|${selectedAgentType}`;
  useEffect(() => {
    void nextTick(() => syncGuideTargets(guideSyncContext));
  }, [guideSyncContext, syncGuideTargets]);
  const continueChatGuide = async (state: any) => {
    const stepId = state?.status === "completed" ? "first-chat" : state?.currentStepId;
    const target = resolveGuidedOnboardingStepTarget(stepId);
    if (target?.surface !== "settings" || !target.routeName) return;
    persistGuidedOnboardingResumeIntent({
      stepId: target.stepId,
      trigger: "window-focus",
    });
    await configClient.openSettings({
      routeName: target.routeName,
    });
  };
  const completeSwitchAgentStep = async () => {
    if (isCompletingSwitchAgentGuide || switchAgentGuide.currentStepId !== "switch-agent") return;
    const stepStatus = switchAgentGuide.stepState?.status;
    if (stepStatus === "completed" || stepStatus === "skipped") return;
    setIsCompletingSwitchAgentGuide(true);
    try {
      const state = await switchAgentGuide.completeStep();
      if (!switchAgentStepLiveRef.current) return;
      await continueChatGuide(state);
      if (!switchAgentStepLiveRef.current) return;
      setIsCompletingSwitchAgentGuide(false);
    } catch (error) {
      if (!switchAgentStepLiveRef.current) return;
      setIsCompletingSwitchAgentGuide(false);
      throw error;
    }
  };
  useEffect(() => {
    switchAgentStepLiveRef.current = true;
    if (!(switchAgentGuide.currentStepId === "switch-agent" && !isAcpSelectedAgent && !isWelcomeState)) return;
    void Promise.resolve().then(() => completeSwitchAgentStep());
    return () => {
      switchAgentStepLiveRef.current = false;
    };
  }, [switchAgentGuide.currentStepId, isAcpSelectedAgent, isWelcomeState, completeSwitchAgentStep]);
  const activeChatGuide = (() => {
    if (switchAgentGuide.showGuide && !isAcpSelectedAgent && guideTargets.agent) {
      return {
        key: "switch-agent" as const,
        title: "Switch Agent",
        description: "Switch to the Argos agent to continue setup.",
        caption: "Select the Argos agent from the sidebar.",
        targetEl: guideTargets.agent,
        stepIndex: switchAgentGuide.stepIndex ?? 1,
        totalSteps: switchAgentGuide.totalSteps ?? 1,
        dismiss: switchAgentGuide.dismissGuide,
      };
    }
    if (switchModelGuide.showGuide && guideTargets.model) {
      return {
        key: "switch-model" as const,
        preferredPanelPlacement: "above" as const,
        title: "Switch Model",
        description: "Select a model to use for chat.",
        caption: "Choose your preferred model.",
        targetEl: guideTargets.model,
        stepIndex: switchModelGuide.stepIndex ?? 1,
        totalSteps: switchModelGuide.totalSteps ?? 1,
        dismiss: switchModelGuide.dismissGuide,
      };
    }
    if (firstChatGuide.showGuide && guideTargets.firstChat) {
      return {
        key: "first-chat" as const,
        title: "Start Your First Chat",
        description: "Type a message to begin chatting with the AI.",
        caption: "Send your first message below.",
        targetEl: guideTargets.firstChat,
        stepIndex: firstChatGuide.stepIndex ?? 1,
        totalSteps: firstChatGuide.totalSteps ?? 1,
        dismiss: firstChatGuide.dismissGuide,
      };
    }
    return null;
  })();
  const activeChatGuidePrimaryLabel =
    activeChatGuide?.key === "switch-agent" || activeChatGuide?.key === "switch-model" ? "Next" : undefined;
  const activeChatGuidePrimaryDisabled =
    activeChatGuide?.key === "switch-agent"
      ? isAcpSelectedAgent || isWelcomeState
      : activeChatGuide?.key === "switch-model"
        ? !guideTargets.model
        : false;
  const handleActiveChatGuideBack = async () => {
    switch (activeChatGuide?.key) {
      case "switch-agent": {
        const state = await switchAgentGuide.activatePreviousStep();
        await continueChatGuide(state);
        break;
      }
      case "switch-model": {
        const state = await switchModelGuide.activatePreviousStep();
        await continueChatGuide(state);
        break;
      }
      case "first-chat": {
        const state = await firstChatGuide.activatePreviousStep();
        await continueChatGuide(state);
        break;
      }
    }
  };
  const handleActiveChatGuideExpert = async () => {
    switch (activeChatGuide?.key) {
      case "switch-agent": {
        const state = await switchAgentGuide.forceComplete();
        await continueChatGuide(state);
        break;
      }
      case "switch-model": {
        const state = await switchModelGuide.forceComplete();
        await continueChatGuide(state);
        break;
      }
      case "first-chat": {
        const state = await firstChatGuide.forceComplete();
        await continueChatGuide(state);
        break;
      }
    }
  };
  const handleActiveChatGuidePrimary = async () => {
    switch (activeChatGuide?.key) {
      case "switch-agent":
        if (!isAcpSelectedAgent && !isWelcomeState) await completeSwitchAgentStep();
        break;
      case "switch-model": {
        const state = await switchModelGuide.completeStep();
        await continueChatGuide(state);
        break;
      }
    }
  };
  return {
    guideRootEl,
    setGuideRootEl,
    activeChatGuide,
    activeChatGuidePrimaryLabel,
    activeChatGuidePrimaryDisabled,
    handleActiveChatGuideBack,
    handleActiveChatGuideExpert,
    handleActiveChatGuidePrimary,
  };
}

function NoAgentsEmptyState({ onManageAgents }: { onManageAgents: () => void }) {
  return (
    <div
      className={`m-auto flex w-full max-w-md flex-col items-center rounded-xl border border-dashed border-border/70 px-6 py-10 text-center ${ENTRANCE_CLASS}`}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-md bg-muted/70 text-muted-foreground">
        <Icon icon="lucide:bot" aria-hidden="true" className="h-5 w-5" />
      </span>
      <p className="mt-3 text-[13px] font-medium text-foreground">No agents set up yet</p>
      <p className="mt-1 text-xs text-muted-foreground">Install or enable an agent to start chatting.</p>
      <button
        data-testid="agent-welcome-manage-action"
        type="button"
        className="mt-4 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition duration-150 hover:bg-primary/90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
        onClick={onManageAgents}
      >
        Manage agents
      </button>
    </div>
  );
}

type NewThreadProjectOption = (typeof projectStore.state.projects)[number];

/** The one composer + context row shared by the welcome and centered states. */
function NewThreadComposerBlock(input: {
  hostRef: RefObject<HTMLDivElement | null>;
  composerRef: RefObject<ThreadComposerHandle | null>;
  isAcpWorkdirMissing: boolean;
  message: string;
  onMessageChange: (message: string) => void;
  attachedFiles: MessageFile[];
  onFilesChange: (files: MessageFile[]) => void;
  onSubmit: () => void;
  onCommandSubmit: (command: string) => void;
  onPendingSkillsChange: (skills: string[]) => void;
  acpDraftSessionId: string | null;
  workspacePath: string | null;
  isAcpSession: boolean;
  submitBlocked: boolean;
  isCreatingWorktree: boolean;
  composerPlaceholder: string;
  activeMachineName: string | undefined;
  selectedProjectName: string;
  selectedProjectDirectoryInvalid: boolean;
  selectedProjectUnavailableTooltip: string;
  canClearProjectSelection: boolean;
  onClearProject: () => void;
  projects: NewThreadProjectOption[];
  isSelectedInvalidProjectPath: (projectPath: string | null | undefined) => boolean;
  onOpenFolder: () => void;
  worktreeDraft: WorktreeDraftConfig;
  onWorktreeDraftChange: (draft: WorktreeDraftConfig) => void;
  worktreeSelectorDisabled: boolean;
}) {
  const {
    hostRef,
    composerRef,
    isAcpWorkdirMissing,
    message,
    onMessageChange,
    attachedFiles,
    onFilesChange,
    onSubmit,
    onCommandSubmit,
    onPendingSkillsChange,
    acpDraftSessionId,
    workspacePath,
    isAcpSession,
    submitBlocked,
    isCreatingWorktree,
    composerPlaceholder,
    activeMachineName,
    selectedProjectName,
    selectedProjectDirectoryInvalid,
    selectedProjectUnavailableTooltip,
    canClearProjectSelection,
    onClearProject,
    projects,
    isSelectedInvalidProjectPath,
    onOpenFolder,
    worktreeDraft,
    onWorktreeDraftChange,
    worktreeSelectorDisabled,
  } = input;
  return (
    <div ref={hostRef} className="flex w-full max-w-4xl flex-col items-stretch">
      {isAcpWorkdirMissing && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          <Icon icon="lucide:folder-open" className="h-4 w-4 shrink-0" />
          <span>This agent needs a project. Pick one below to start chatting.</span>
        </div>
      )}
      <ThreadComposer
        ref={composerRef}
        message={message}
        onMessageChange={onMessageChange}
        files={attachedFiles}
        onFilesChange={onFilesChange}
        onSubmit={onSubmit}
        onCommandSubmit={onCommandSubmit}
        onPendingSkillsChange={onPendingSkillsChange}
        sessionId={acpDraftSessionId}
        workspacePath={workspacePath}
        isAcpSession={isAcpSession}
        submitDisabled={submitBlocked}
        sendDisabled={submitBlocked || isCreatingWorktree}
        isSending={isCreatingWorktree}
        placeholder={composerPlaceholder}
        maxWidthClass="w-full"
      />
      <div className="mt-4 flex items-center justify-center gap-3 text-xs text-muted-foreground">
        <span role="status" data-testid="new-thread-active-machine" className="inline-flex items-center gap-1.5">
          <Icon icon="lucide:monitor-dot" className="size-3.5" />
          <span>Running on {activeMachineName ?? "This computer"}</span>
        </span>
        <span aria-hidden="true" className="h-3 w-px bg-border/60" />
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                data-testid="new-thread-project-trigger"
                className="h-7 px-2 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              />
            }
          >
            <span>{selectedProjectName}</span>
            {selectedProjectDirectoryInvalid && (
              <span
                role="img"
                aria-label={selectedProjectUnavailableTooltip}
                title={selectedProjectUnavailableTooltip}
                data-testid="new-thread-project-missing-warning"
              >
                ⚠
              </span>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="min-w-[200px]">
            <DropdownMenuItem
              data-testid="new-thread-clear-project"
              className="gap-2 text-xs py-1.5 px-2"
              disabled={!canClearProjectSelection}
              onClick={onClearProject}
            >
              <span>No Project</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs">Recent Projects</DropdownMenuLabel>
              {projects.slice(0, PROJECT_MENU_LIMIT).map((project) => (
                <DropdownMenuItem
                  key={project.path}
                  className="gap-2 text-xs py-1.5 px-2"
                  onClick={() => selectProject(project.path)}
                >
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="truncate">{project.name}</span>
                    <span className="text-[10px] text-muted-foreground truncate">{project.path}</span>
                  </div>
                  {isSelectedInvalidProjectPath(project.path) && (
                    <span
                      role="img"
                      aria-label={selectedProjectUnavailableTooltip}
                      title={selectedProjectUnavailableTooltip}
                      data-testid="new-thread-project-menu-missing-warning"
                    >
                      ⚠
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 text-xs py-1.5 px-2" onClick={onOpenFolder}>
              <span>Open Folder</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <WorktreeSelector
          workspacePath={workspacePath}
          value={worktreeDraft}
          onChange={onWorktreeDraftChange}
          disabled={worktreeSelectorDisabled}
        />
      </div>
      <ChatStatusBar
        acpDraftSessionId={acpDraftSessionId ?? undefined}
        maxWidthClass="max-w-4xl"
        composerFooterActive
      />
    </div>
  );
}

function NewThreadPage() {
  const { toast } = useToast();
  const projectState = useStore(projectStore);
  const sessionState = useStore(sessionStore);
  const agentState = useStore(agentStore);
  const modelState = useStore(modelStore);
  const draftState = useStore(draftStore);
  const connectionState = useRuntimeConnectionState();
  const activeMachine = useWorkspaceStore().activeWorkspace;
  const isDaemonConnected = connectionState.connected;
  const [message, setMessage] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<MessageFile[]>([]);
  const pendingSkillsRef = useRef<string[]>([]);
  const firstChatGuideHostRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<ThreadComposerHandle | null>(null);
  const [isCreatingWorktree, setIsCreatingWorktree] = useState(false);
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [worktreeDraft, setWorktreeDraft] = useState<WorktreeDraftConfig>(emptyWorktreeDraft);
  const selectedProjectDirectoryCheckSeqRef = useRef(0);
  const [selectedProjectDirectoryStatus, setSelectedProjectDirectoryStatus] = useState<
    "none" | "checking" | "valid" | "invalid"
  >("none");
  const prevAgentIdRef = useRef<string | null>(agentState.selectedAgentId);
  useEffect(() => {
    const nextId = agentState.selectedAgentId;
    const prevId = prevAgentIdRef.current;
    if (nextId && nextId !== prevId) {
      swapProjectForAgent(nextId, prevId);
      prevAgentIdRef.current = nextId;
    }
  }, [agentState.selectedAgentId]);
  const {
    noAgentsEnabled,
    isWelcomeState,
    effectiveAgent,
    selectedAgent,
    isAcpSelectedAgent,
    selectedProjectPath,
    selectedProjectName,
    canClearProjectSelection,
    selectedProjectDirectoryInvalid,
    selectedProjectUnavailableTooltip,
    isSelectedInvalidProjectPath,
    isAcpWorkdirMissing,
    isAcpWorkdirUnavailable,
  } = deriveNewThreadContext({
    agentState,
    sessionState,
    projectState,
    selectedProjectDirectoryStatus,
  });
  const { acpDraftSessionId, acpDraftModelSelection } = useAcpDraftSession({
    isAcpSelectedAgent,
    selectedAgentId: selectedAgent.id,
    selectedProjectPath,
    selectedProjectDirectoryStatus,
    permissionMode: draftState.permissionMode,
    currentAgentId: agentState.selectedAgentId ?? effectiveAgent?.agent.id ?? "argos",
    currentProjectDir: projectState.selectedProjectPath?.trim() ?? "",
  });
  const { resolveModel, resolveSubmissionModelSelection } = createModelResolution({
    modelState,
    draftState,
    isAcpSelectedAgent,
    selectedAgentId: selectedAgent.id,
    acpDraftModelSelection,
  });
  const { prepareFiles, handleFilesChange } = useModelAwareAttachments(resolveSubmissionModelSelection);
  const { onSubmit, onCommandSubmit } = useThreadSubmission({
    toast,
    message,
    attachedFiles,
    setMessage,
    setAttachedFiles,
    prepareFiles,
    isAcpWorkdirUnavailable,
    isDaemonConnected,
    isAcpSelectedAgent,
    worktreeDraft,
    isCreatingWorktree,
    setIsCreatingWorktree,
    selectedProjectPath,
    rawSelectedProjectPath: projectState.selectedProjectPath,
    acpDraftSessionId,
    draftState,
    resolveModel,
    agentId: agentState.selectedAgentId ?? effectiveAgent?.agent.id ?? "argos",
    firstChatGuideHostRef,
    composerRef,
    pendingSkillsRef,
  });
  const onPendingSkillsChange = (skills: string[]) => {
    pendingSkillsRef.current = [...skills];
  };
  const clearSelectedProject = () => {
    selectProject(null, "manual");
  };
  const handleSessionSelect = (sessionId: string) => {
    void selectSession(sessionId);
  };
  const openAgentSettings = async () => {
    await settingsClient.openSettings({
      routeName: "settings-argos-agents",
    });
  };
  useEffect(() => {
    if (!selectedProjectPath) {
      void Promise.resolve().then(() => setSelectedProjectDirectoryStatus("none"));
      return;
    }
    const seq = ++selectedProjectDirectoryCheckSeqRef.current;
    let cancelled = false;
    void Promise.resolve()
      .then(() => {
        setSelectedProjectDirectoryStatus("checking");
        return fileClient.isDirectory(selectedProjectPath);
      })
      .then((isDir) => {
        if (cancelled || seq !== selectedProjectDirectoryCheckSeqRef.current) return;
        setSelectedProjectDirectoryStatus(isDir ? "valid" : "invalid");
      })
      .catch((error) => {
        if (cancelled || seq !== selectedProjectDirectoryCheckSeqRef.current) return;
        console.warn("[NewThreadPage] Failed to validate selected project directory:", error);
        setSelectedProjectDirectoryStatus("invalid");
      });
    return () => {
      cancelled = true;
    };
  }, [selectedProjectPath]);
  useAgentDraftDefaults({ agentId: selectedAgent.id, agentType: selectedAgent.type });
  useEffect(() => {
    draftStore.setState((s) => ({
      ...s,
      projectDir: projectState.selectedProjectPath ?? undefined,
    }));
  }, [projectState.selectedProjectPath]);
  const {
    guideRootEl,
    setGuideRootEl,
    activeChatGuide,
    activeChatGuidePrimaryLabel,
    activeChatGuidePrimaryDisabled,
    handleActiveChatGuideBack,
    handleActiveChatGuideExpert,
    handleActiveChatGuidePrimary,
  } = useNewThreadGuides({
    firstChatGuideHostRef,
    isAcpSelectedAgent,
    isWelcomeState,
    selectedAgentType: selectedAgent.type,
  });
  const composerPlaceholder = isAcpWorkdirMissing
    ? "Pick a project to enable this agent"
    : "Ask anything. / for commands, @ for context";
  const submitBlocked = isAcpWorkdirUnavailable || !isDaemonConnected;

  // The one composer + context row shared by the welcome and centered states.
  const composerBlock = (
    <NewThreadComposerBlock
      hostRef={firstChatGuideHostRef}
      composerRef={composerRef}
      isAcpWorkdirMissing={isAcpWorkdirMissing}
      message={message}
      onMessageChange={setMessage}
      attachedFiles={attachedFiles}
      onFilesChange={(files) => void handleFilesChange(files, setAttachedFiles)}
      onSubmit={() => void onSubmit()}
      onCommandSubmit={(command) => void onCommandSubmit(command)}
      onPendingSkillsChange={onPendingSkillsChange}
      acpDraftSessionId={acpDraftSessionId}
      workspacePath={selectedProjectPath}
      isAcpSession={isAcpSelectedAgent}
      submitBlocked={submitBlocked}
      isCreatingWorktree={isCreatingWorktree}
      composerPlaceholder={composerPlaceholder}
      activeMachineName={activeMachine?.name}
      selectedProjectName={selectedProjectName}
      selectedProjectDirectoryInvalid={selectedProjectDirectoryInvalid}
      selectedProjectUnavailableTooltip={selectedProjectUnavailableTooltip}
      canClearProjectSelection={canClearProjectSelection}
      onClearProject={clearSelectedProject}
      projects={projectState.projects}
      isSelectedInvalidProjectPath={isSelectedInvalidProjectPath}
      onOpenFolder={() => setFolderPickerOpen(true)}
      worktreeDraft={worktreeDraft}
      onWorktreeDraftChange={setWorktreeDraft}
      worktreeSelectorDisabled={selectedProjectDirectoryStatus !== "valid"}
    />
  );
  return (
    <div
      ref={setGuideRootEl}
      data-testid="new-thread-page"
      className="window-drag-region relative flex h-full w-full flex-col overflow-y-auto overflow-x-clip"
    >
      <BrandWordmark />

      <div className="window-no-drag-region relative z-[1] flex h-full w-full flex-1 flex-col px-6 py-10">
        {noAgentsEnabled ? (
          <NoAgentsEmptyState onManageAgents={() => void openAgentSettings()} />
        ) : isWelcomeState ? (
          <div className={`mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center ${ENTRANCE_CLASS}`}>
            <div className="mb-3 flex w-full items-center justify-center">
              <AgentSwitcher variant="welcome" />
            </div>
            <header className="flex w-full items-baseline">
              <h1 className="text-base font-medium text-foreground">
                {effectiveAgent?.agent.name
                  ? `What should we build in ${effectiveAgent.agent.name}?`
                  : "What should we build?"}
              </h1>
            </header>
            {composerBlock}
            <RecentSessionsStrip agentId={effectiveAgent?.agent.id ?? null} onSelect={handleSessionSelect} />
          </div>
        ) : (
          <div
            className={`mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center ${ENTRANCE_CLASS}`}
          >
            <h1 className="sr-only">New thread</h1>
            <div className="mb-3 flex w-full max-w-2xl items-center justify-center">
              <AgentSwitcher variant="topbar" className="text-muted-foreground" />
            </div>
            {composerBlock}
          </div>
        )}
      </div>

      <GuidedOnboardingOverlay
        visible={Boolean(activeChatGuide?.targetEl)}
        containerEl={guideRootEl}
        targetEl={activeChatGuide?.targetEl ?? null}
        preferredPanelPlacement={activeChatGuide?.preferredPanelPlacement ?? "auto"}
        eyebrow="Getting Started"
        title={activeChatGuide?.title ?? ""}
        description={activeChatGuide?.description ?? ""}
        caption={activeChatGuide?.caption}
        stepIndex={activeChatGuide?.stepIndex ?? 1}
        totalSteps={activeChatGuide?.totalSteps ?? 1}
        closeLabel="Close"
        backLabel={activeChatGuide ? "Back" : undefined}
        expertLabel={activeChatGuide ? "Skip All" : undefined}
        primaryLabel={activeChatGuidePrimaryLabel}
        primaryDisabled={activeChatGuidePrimaryDisabled}
        onClose={() => activeChatGuide?.dismiss()}
        onBack={() => void handleActiveChatGuideBack()}
        onExpert={() => void handleActiveChatGuideExpert()}
        onPrimary={() => void handleActiveChatGuidePrimary()}
      />
      <FolderPickerDialog
        open={folderPickerOpen}
        onOpenChange={setFolderPickerOpen}
        initialPath={projectStore.state.selectedProjectPath ?? undefined}
        onSelect={(path) => void selectProjectFolder(path, "manual")}
      />
    </div>
  );
}
export default NewThreadPage;
