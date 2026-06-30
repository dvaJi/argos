import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@tanstack/react-store";
import { Icon } from "@iconify/react";
import { TooltipProvider } from "@shadcn/components/ui/tooltip";
import { Button } from "@shadcn/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@shadcn/components/ui/dropdown-menu";
import ChatInputBox from "@/components/chat/ChatInputBox";
import logoDark from "@/assets/logo-dark.png";
import ChatInputToolbar from "@/components/chat/ChatInputToolbar";
import ChatStatusBar from "@/components/chat/ChatStatusBar";
import { useToast } from "@/components/use-toast";
import GuidedOnboardingOverlay from "@/components/onboarding/GuidedOnboardingOverlay";
import { useGuidedOnboardingStep } from "@/composables/useGuidedOnboardingStep";
import {
  projectStore,
  selectProject,
  fetchProjects,
  loadDefaultProjectPath,
  openFolderPicker,
} from "@/stores/ui/project";
import { sessionStore, createSession, selectSession, sendMessage, fetchSessions } from "@/stores/ui/session";
import { agentStore, selectedAgent as getSelectedAgent } from "@/stores/ui/agent";
import { modelStore, findChatSelectableModel, initialize, getChatSelectableModelGroups } from "@/stores/modelStore";
import { draftStore, toGenerationSettings as getToGenerationSettings } from "@/stores/ui/draft";
import { createConfigClient } from "@api/ConfigClient";
import { createFileClient } from "@api/FileClient";
import { createModelClient } from "@api/ModelClient";
import { createSessionClient } from "@api/SessionClient";
import { persistGuidedOnboardingResumeIntent } from "@/lib/onboardingResume";
import { resolveGuidedOnboardingStepTarget } from "@shared/guidedOnboarding";
import { normalizeArgosSubagentConfig } from "@shared/lib/argosSubagents";
import { resolveChatModelByQuery, resolvePreferredChatModel, type ChatModelSelection } from "@/lib/chatModelSelection";
import { scheduleStartupDeferredTask } from "@/lib/startupDeferred";
import { isManualCompactionCommand } from "@/components/chat/mentions/utils";
import { filterUnsupportedAudioAttachments } from "@/lib/audioInputSupport";
import { cancelChatInputHeroFlight, prepareChatInputHeroFlight } from "@/lib/chatInputHero";
import type { ArgosAgentConfig, MessageFile, SessionGenerationSettings } from "@shared/types/agent-interface";

const configClient = createConfigClient();
const fileClient = createFileClient();
const modelClient = createModelClient();
const sessionClient = createSessionClient();

type SubmissionModelSelection = { providerId: string; modelId: string };

export function NewThreadPage() {
  const { toast } = useToast();
  const projectState = useStore(projectStore);
  const sessionState = useStore(sessionStore);
  const agentState = useStore(agentStore);
  const modelState = useStore(modelStore);
  const draftState = useStore(draftStore);

  const switchAgentGuide = useGuidedOnboardingStep("switch-agent");
  const switchModelGuide = useGuidedOnboardingStep("switch-model");
  const firstChatGuide = useGuidedOnboardingStep("first-chat");

  const [message, setMessage] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<MessageFile[]>([]);
  const [pendingSkills, setPendingSkills] = useState<string[]>([]);
  const guideRootRef = useRef<HTMLDivElement>(null);
  const agentGuideTargetRef = useRef<HTMLDivElement | null>(null);
  const modelGuideTargetRef = useRef<HTMLDivElement | null>(null);
  const firstChatGuideHostRef = useRef<HTMLDivElement>(null);
  const firstChatGuideTargetRef = useRef<HTMLDivElement | null>(null);
  const [isVoiceInputEnabled, setIsVoiceInputEnabled] = useState(false);
  const chatInputRef = useRef<{
    triggerAttach: () => void;
    insertRecognizedText: (text: string) => void;
    insertWorkspaceReference: (targetPath: string) => boolean;
    getPendingSkillsSnapshot: () => string[];
    focusInput: () => void;
  } | null>(null);
  const [acpDraftSessionId, setAcpDraftSessionId] = useState<string | null>(null);
  const [acpDraftModelSelection, setAcpDraftModelSelection] = useState<SubmissionModelSelection | null>(null);
  const lastAcpDraftKeyRef = useRef<string | null>(null);
  const acpDraftRequestSeqRef = useRef(0);
  const [isCompletingSwitchAgentGuide, setIsCompletingSwitchAgentGuide] = useState(false);
  const currentDraftDefaultsTaskRef = useRef<Promise<void> | null>(null);
  const cancelEnsureDraftTaskRef = useRef<(() => void) | null>(null);
  const voiceInputConfigTokenRef = useRef(0);
  const attachmentFilterTokenRef = useRef(0);
  const selectedProjectDirectoryCheckSeqRef = useRef(0);
  const [selectedProjectDirectoryStatus, setSelectedProjectDirectoryStatus] = useState<
    "none" | "checking" | "valid" | "invalid"
  >("none");

  const availableAgents = useMemo(
    () => (Array.isArray(agentState.agents) ? agentState.agents : []),
    [agentState.agents],
  );

  const resolveAgentType = useCallback(
    (agentId: string | null | undefined): "argos" | "acp" => {
      if (!agentId) return "argos";
      const matchedAgent = availableAgents.find((a) => a.id === agentId);
      const sel = getSelectedAgent()?.id === agentId ? getSelectedAgent() : null;
      const explicitType = matchedAgent?.agentType ?? matchedAgent?.type ?? sel?.type;
      if (explicitType === "argos" || explicitType === "acp") return explicitType;
      return agentId === "argos" ? "argos" : "acp";
    },
    [availableAgents, getSelectedAgent()],
  );

  const selectedAgent = useMemo(() => {
    const id = agentState.selectedAgentId ?? "argos";
    const matched = availableAgents.find((a) => a.id === id);
    if (matched) return matched;
    const agent = getSelectedAgent();
    if (agent?.id === id) return agent;
    return { id, type: resolveAgentType(id) };
  }, [agentState.selectedAgentId, availableAgents, getSelectedAgent(), resolveAgentType]);

  const isAcpSelectedAgent = selectedAgent.type === "acp";
  const isArgosSelectedAgent = selectedAgent.type === "argos";

  const normalizeProjectPath = (value: string | null | undefined) => {
    const n = value?.trim();
    return n || null;
  };

  const selectedProjectPath = normalizeProjectPath(projectState.selectedProjectPath);
  const hasExplicitNoProjectSelection =
    projectState.selectionSource === "manual" && !projectState.selectedProjectPath?.trim();

  const selectedProjectName = useMemo(() => {
    const selProj = projectState.projects.find((p) => p.path === projectState.selectedProjectPath);
    if (selProj?.name) return selProj.name;
    return hasExplicitNoProjectSelection ? "No Project" : "Select Project";
  }, [projectState.selectedProjectPath, hasExplicitNoProjectSelection]);

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

  const syncGuideTargets = useCallback(() => {
    if (typeof document === "undefined") return;
    agentGuideTargetRef.current =
      (document.querySelector(
        '[data-testid="sidebar-agent-button"][data-agent-id="argos"]',
      ) as HTMLDivElement | null) ??
      (document.querySelector(
        '[data-testid="sidebar-agent-button"][data-agent-type="argos"]',
      ) as HTMLDivElement | null);
    modelGuideTargetRef.current = document.querySelector('[data-testid="app-model-switcher"]') as HTMLDivElement | null;
    firstChatGuideTargetRef.current =
      (firstChatGuideHostRef.current?.querySelector('[data-testid="chat-input-box"]') as HTMLDivElement | null) ??
      firstChatGuideHostRef.current;
  }, []);

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

  const resolveModel = useCallback(async (): Promise<SubmissionModelSelection | null> => {
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
          ? { providerId: draftState.providerId, modelId: draftState.modelId }
          : null,
        preferredModel,
        defaultModel,
      ],
    });
    if (resolvedModel) return { providerId: resolvedModel.providerId, modelId: resolvedModel.model.id };
    return null;
  }, [modelState, draftState]);

  const resolveVoiceInputSelection = useCallback((): SubmissionModelSelection | null => {
    if (isAcpSelectedAgent) return null;
    if (draftState.providerId && draftState.modelId) {
      return { providerId: draftState.providerId, modelId: draftState.modelId };
    }
    return null;
  }, [isAcpSelectedAgent, draftState]);

  const resolveSubmissionModelSelection = useCallback(async (): Promise<SubmissionModelSelection | null> => {
    if (isAcpSelectedAgent) {
      if (acpDraftModelSelection) return acpDraftModelSelection;
      const agentId = selectedAgent.id?.trim();
      return agentId ? { providerId: "acp", modelId: agentId } : null;
    }
    return await resolveModel();
  }, [isAcpSelectedAgent, acpDraftModelSelection, selectedAgent.id, resolveModel]);

  const shouldIgnoreManualCompactionDraft = (text: string): boolean => {
    return !isAcpSelectedAgent && isManualCompactionCommand(text);
  };

  const notifyUnsupportedAudioAttachments = useCallback(
    (selection: { providerId: string; modelId: string }, rejectedAudioFiles: MessageFile[]) => {
      if (rejectedAudioFiles.length === 0) return;
      const modelLabel =
        findChatSelectableModel(selection.providerId, selection.modelId)?.model.name ?? selection.modelId;
      toast({
        title: "Audio Input Not Supported",
        description: `${rejectedAudioFiles.length} audio file(s) not supported by ${modelLabel}.`,
      });
    },
    [toast],
  );

  const prepareFilesForCurrentModel = useCallback(
    async (files: MessageFile[]): Promise<MessageFile[]> => {
      const selection = await resolveSubmissionModelSelection();
      if (!selection || files.length === 0) return files;
      try {
        const capabilities = await modelClient.getCapabilities(selection.providerId, selection.modelId);
        if (capabilities.supportsAudioInput !== false) return files;
        const { acceptedFiles, rejectedAudioFiles } = filterUnsupportedAudioAttachments(files, false);
        notifyUnsupportedAudioAttachments(selection, rejectedAudioFiles);
        return acceptedFiles;
      } catch (error) {
        console.warn("[NewThreadPage] Failed to resolve audio input capability:", error);
        return files;
      }
    },
    [resolveSubmissionModelSelection, notifyUnsupportedAudioAttachments],
  );

  const submitText = useCallback(
    async (text: string, files: MessageFile[]) => {
      if (!text.trim()) return;
      if (isAcpWorkdirUnavailable) return;

      const chatInputBoxEl = firstChatGuideHostRef.current?.querySelector(
        '[data-testid="chat-input-box"]',
      ) as HTMLElement | null;
      const preparedHeroFlight = prepareChatInputHeroFlight(chatInputBoxEl);

      const agentId = agentState.selectedAgentId ?? "argos";
      const isAcp = isAcpSelectedAgent;

      try {
        if (isAcp && acpDraftSessionId) {
          await selectSession(acpDraftSessionId);
          await sendMessage(acpDraftSessionId, { text, files });
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
            if (preparedHeroFlight) cancelChatInputHeroFlight();
            return;
          }
          providerId = resolved.providerId;
          modelId = resolved.modelId;
        }

        const pendingSkillsSnapshot = chatInputRef.current?.getPendingSkillsSnapshot?.() ?? pendingSkills;
        const dedupedPendingSkills = Array.from(new Set(pendingSkillsSnapshot));

        await createSession({
          message: text,
          files,
          projectDir: projectState.selectedProjectPath ?? undefined,
          agentId,
          providerId,
          modelId,
          permissionMode: draftState.permissionMode,
          disabledAgentTools: isAcp ? undefined : [...draftState.disabledAgentTools],
          subagentEnabled: isAcp ? false : draftState.subagentEnabled,
          generationSettings: getToGenerationSettings?.() ?? {},
          activeSkills: dedupedPendingSkills.length > 0 ? dedupedPendingSkills : undefined,
        });
      } catch (error) {
        if (preparedHeroFlight) cancelChatInputHeroFlight();
        throw error;
      }
    },
    [
      isAcpWorkdirUnavailable,
      selectedAgent,
      isAcpSelectedAgent,
      acpDraftSessionId,
      resolveModel,
      pendingSkills,
      projectState,
      draftState,
    ],
  );

  const onSubmit = useCallback(async () => {
    if (isAcpWorkdirUnavailable) return;
    const text = message.trim();
    if (!text) return;
    if (shouldIgnoreManualCompactionDraft(text)) return;
    const files = await prepareFilesForCurrentModel([...attachedFiles]);
    try {
      await submitText(text, files);
      setMessage("");
      setAttachedFiles([]);
    } catch (e) {
      console.error("[NewThreadPage] submit failed:", e);
    }
  }, [isAcpWorkdirUnavailable, message, attachedFiles, prepareFilesForCurrentModel, submitText]);

  const onCommandSubmit = useCallback(
    async (command: string) => {
      if (isAcpWorkdirUnavailable) return;
      const text = command.trim();
      if (!text) return;
      if (shouldIgnoreManualCompactionDraft(text)) return;
      const files = await prepareFilesForCurrentModel([...attachedFiles]);
      try {
        await submitText(text, files);
        setAttachedFiles([]);
      } catch (e) {
        console.error("[NewThreadPage] submit failed:", e);
      }
    },
    [isAcpWorkdirUnavailable, attachedFiles, prepareFilesForCurrentModel, submitText],
  );

  const onFilesChange = useCallback(
    async (files: MessageFile[]) => {
      const token = ++attachmentFilterTokenRef.current;
      const filteredFiles = await prepareFilesForCurrentModel(files);
      if (token !== attachmentFilterTokenRef.current) return;
      setAttachedFiles(filteredFiles);
    },
    [prepareFilesForCurrentModel],
  );

  const onPendingSkillsChange = useCallback((skills: string[]) => {
    setPendingSkills([...skills]);
  }, []);

  const clearSelectedProject = useCallback(() => {
    selectProject(null, "manual");
  }, []);

  const onAttach = useCallback(() => {
    chatInputRef.current?.triggerAttach();
  }, []);

  useEffect(() => {
    if (!selectedProjectPath) {
      setSelectedProjectDirectoryStatus("none");
      return;
    }
    const seq = ++selectedProjectDirectoryCheckSeqRef.current;
    let cancelled = false;
    setSelectedProjectDirectoryStatus("checking");
    fileClient
      .isDirectory(selectedProjectPath)
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

  useEffect(() => {
    if (
      !agentState.selectedAgentId ||
      selectedAgent.type === "argos" ||
      !selectedProjectPath ||
      selectedProjectDirectoryStatus !== "valid"
    ) {
      setAcpDraftSessionId(null);
      setAcpDraftModelSelection(null);
      lastAcpDraftKeyRef.current = null;
      return;
    }

    const agentId = agentState.selectedAgentId;
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
  }, [
    agentState.selectedAgentId,
    selectedProjectPath,
    selectedProjectDirectoryStatus,
    selectedAgent.type,
    acpDraftSessionId,
  ]);

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
        permissionMode: draftState.permissionMode,
      });
      if (requestSeq !== acpDraftRequestSeqRef.current) return;
      const currentAgentId = agentState.selectedAgentId;
      const currentProjectDir = projectState.selectedProjectPath?.trim();
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
          ? { providerId: session.providerId.trim(), modelId: session.modelId.trim() }
          : { providerId: "acp", modelId: agentId },
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
    const applyDefaults = async () => {
      const agentId = selectedAgent.id;
      const globalDefault = normalizeProjectPath(projectState.defaultProjectPath);
      const currentProject = normalizeProjectPath(projectState.selectedProjectPath);
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

      if (selectedAgent.type === "acp") {
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

      const config = await resolveArgosAgentConfig(agentId);
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
  }, [selectedAgent.id, selectedAgent.type]);

  useEffect(() => {
    draftStore.setState((s) => ({ ...s, projectDir: projectState.selectedProjectPath ?? undefined }));
  }, [projectState.selectedProjectPath]);

  useEffect(() => {
    const sync = () => {
      void nextTick(syncGuideTargets);
    };
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, [syncGuideTargets]);

  useEffect(() => {
    return () => {
      cancelEnsureDraftTaskRef.current?.();
      cancelEnsureDraftTaskRef.current = null;
    };
  }, []);

  useEffect(() => {
    void nextTick(syncGuideTargets);
  }, [
    switchAgentGuide.showGuide,
    switchModelGuide.showGuide,
    firstChatGuide.showGuide,
    selectedAgent.type,
    syncGuideTargets,
  ]);

  useEffect(() => {
    if (switchAgentGuide.currentStepId === "switch-agent" && isArgosSelectedAgent) {
      void completeSwitchAgentStep();
    }
  }, [switchAgentGuide.currentStepId, isArgosSelectedAgent]);

  const completeSwitchAgentStep = async () => {
    if (isCompletingSwitchAgentGuide || switchAgentGuide.currentStepId !== "switch-agent") return;
    const stepStatus = switchAgentGuide.stepState?.status;
    if (stepStatus === "completed" || stepStatus === "skipped") return;
    setIsCompletingSwitchAgentGuide(true);
    try {
      const state = await switchAgentGuide.completeStep();
      await continueChatGuide(state);
    } finally {
      setIsCompletingSwitchAgentGuide(false);
    }
  };

  const continueChatGuide = async (state: any) => {
    const stepId = state?.status === "completed" ? "first-chat" : state?.currentStepId;
    const target = resolveGuidedOnboardingStepTarget(stepId);
    if (target?.surface !== "settings" || !target.routeName) return;
    persistGuidedOnboardingResumeIntent({ stepId: target.stepId, trigger: "window-focus" });
    await configClient.openSettings({ routeName: target.routeName });
  };

  const activeChatGuide = useMemo(() => {
    if (switchAgentGuide.showGuide && !isArgosSelectedAgent && agentGuideTargetRef.current) {
      return {
        key: "switch-agent" as const,
        title: "Switch Agent",
        description: "Switch to the Argos agent to continue setup.",
        caption: "Select the Argos agent from the sidebar.",
        targetEl: agentGuideTargetRef.current,
        stepIndex: switchAgentGuide.stepIndex ?? 1,
        totalSteps: switchAgentGuide.totalSteps ?? 1,
        dismiss: switchAgentGuide.dismissGuide,
      };
    }
    if (switchModelGuide.showGuide && modelGuideTargetRef.current) {
      return {
        key: "switch-model" as const,
        preferredPanelPlacement: "above" as const,
        title: "Switch Model",
        description: "Select a model to use for chat.",
        caption: "Choose your preferred model.",
        targetEl: modelGuideTargetRef.current,
        stepIndex: switchModelGuide.stepIndex ?? 1,
        totalSteps: switchModelGuide.totalSteps ?? 1,
        dismiss: switchModelGuide.dismissGuide,
      };
    }
    if (firstChatGuide.showGuide && firstChatGuideTargetRef.current) {
      return {
        key: "first-chat" as const,
        title: "Start Your First Chat",
        description: "Type a message to begin chatting with the AI.",
        caption: "Send your first message below.",
        targetEl: firstChatGuideTargetRef.current,
        stepIndex: firstChatGuide.stepIndex ?? 1,
        totalSteps: firstChatGuide.totalSteps ?? 1,
        dismiss: firstChatGuide.dismissGuide,
      };
    }
    return null;
  }, [switchAgentGuide.showGuide, switchModelGuide.showGuide, firstChatGuide.showGuide, isArgosSelectedAgent]);

  const activeChatGuidePrimaryLabel =
    activeChatGuide?.key === "switch-agent" || activeChatGuide?.key === "switch-model" ? "Next" : undefined;

  const activeChatGuidePrimaryDisabled =
    activeChatGuide?.key === "switch-agent"
      ? !isArgosSelectedAgent
      : activeChatGuide?.key === "switch-model"
        ? !modelGuideTargetRef.current
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
        if (isArgosSelectedAgent) await completeSwitchAgentStep();
        break;
      case "switch-model": {
        const state = await switchModelGuide.completeStep();
        await continueChatGuide(state);
        break;
      }
    }
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div ref={guideRootRef} data-testid="new-thread-page" className="relative h-full w-full flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="mb-4">
            <img src={logoDark} className="w-14 h-14" loading="lazy" />
          </div>

          <h1 className="text-3xl font-semibold text-foreground mb-4">New Thread</h1>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                data-testid="new-thread-project-trigger"
                className="h-7 px-2.5 gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-6"
              >
                <span>{selectedProjectName}</span>
                {selectedProjectDirectoryInvalid && (
                  <span data-testid="new-thread-project-missing-warning" title={selectedProjectUnavailableTooltip}>
                    ⚠
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="min-w-[200px]">
              <DropdownMenuLabel className="text-xs">Recent Projects</DropdownMenuLabel>
              <DropdownMenuItem
                data-testid="new-thread-clear-project"
                className="gap-2 text-xs py-1.5 px-2"
                disabled={!canClearProjectSelection}
                onClick={clearSelectedProject}
              >
                <span>No Project</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {projectState.projects.map((project) => (
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
                      data-testid="new-thread-project-menu-missing-warning"
                      title={selectedProjectUnavailableTooltip}
                    >
                      ⚠
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem className="gap-2 text-xs py-1.5 px-2" onClick={() => openFolderPicker()}>
                <span>Open Folder</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {isAcpWorkdirMissing && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              <Icon icon="lucide:folder-open" className="h-4 w-4 shrink-0" />
              <span>This agent needs a project. Pick one above to start chatting.</span>
            </div>
          )}

          <div ref={firstChatGuideHostRef} className="w-full max-w-4xl flex justify-center">
            {/* @ts-expect-error - Complex type intersection issue */}
            <ChatInputBox
              ref={chatInputRef}
              modelValue={message}
              onUpdateModelValue={(value: string) => setMessage(value)}
              files={attachedFiles}
              sessionId={acpDraftSessionId}
              workspacePath={projectState.selectedProjectPath ?? null}
              isAcpSession={isAcpSelectedAgent}
              submitDisabled={isAcpWorkdirUnavailable}
              onUpdateFiles={onFilesChange}
              onPendingSkillsChange={onPendingSkillsChange}
              onCommandSubmit={onCommandSubmit}
              onSubmit={onSubmit}
              onToggleVoiceInput={() => {}}
            >
              <ChatInputToolbar
                onQueue={() => {}}
                onSteer={() => {}}
                onStop={() => {}}
                showVoiceInput={isVoiceInputEnabled}
                isVoiceInputListening={false}
                isVoiceInputTranscribing={false}
                sendDisabled={isAcpWorkdirUnavailable || !message.trim()}
                onAttach={onAttach}
                onVoiceInput={() => {}}
                onSend={onSubmit}
              />
            </ChatInputBox>
          </div>

          <ChatStatusBar acpDraftSessionId={acpDraftSessionId ?? undefined} />
        </div>

        <GuidedOnboardingOverlay
          visible={Boolean(activeChatGuide?.targetEl)}
          containerEl={guideRootRef.current}
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
      </div>
    </TooltipProvider>
  );
}

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

export default NewThreadPage;
