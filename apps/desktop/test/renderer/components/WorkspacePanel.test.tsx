import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import WorkspacePanel from "@/components/sidepanel/WorkspacePanel";

const {
  showArtifactMock,
  toggleSectionMock,
  clearArtifactMock,
  clearFileMock,
  clearDiffMock,
  selectFileMock,
  selectDiffMock,
  registerWorkspaceMock,
  watchWorkspaceMock,
  unwatchWorkspaceMock,
  readDirectoryMock,
  getGitStatusMock,
  readFilePreviewMock,
  getGitDiffMock,
  expandDirectoryMock,
  openFileMock,
  revealFileInFolderMock,
  selectDirectoryMock,
  isDirectoryMock,
  getPathForFileMock,
  workspaceInvalidationState,
  setSessionProjectDirMock,
} = vi.hoisted(() => ({
  showArtifactMock: vi.fn<(...args: any[]) => any>(),
  toggleSectionMock: vi.fn<(...args: any[]) => any>(),
  clearArtifactMock: vi.fn<(...args: any[]) => any>(),
  clearFileMock: vi.fn<(...args: any[]) => any>(),
  clearDiffMock: vi.fn<(...args: any[]) => any>(),
  selectFileMock: vi.fn<(...args: any[]) => any>(),
  selectDiffMock: vi.fn<(...args: any[]) => any>(),
  registerWorkspaceMock: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
  watchWorkspaceMock: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
  unwatchWorkspaceMock: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
  readDirectoryMock: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
  getGitStatusMock: vi.fn<(...args: any[]) => any>().mockResolvedValue({
    workspacePath: "C:/repo",
    branch: "main",
    ahead: 0,
    behind: 0,
    changes: [],
  }),
  readFilePreviewMock: vi.fn<(...args: any[]) => any>().mockResolvedValue(null),
  getGitDiffMock: vi.fn<(...args: any[]) => any>().mockResolvedValue(null),
  expandDirectoryMock: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
  openFileMock: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
  revealFileInFolderMock: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
  selectDirectoryMock: vi.fn<(...args: any[]) => any>().mockResolvedValue(null),
  isDirectoryMock: vi.fn<(...args: any[]) => any>().mockResolvedValue(true),
  getPathForFileMock: vi.fn<(...args: any[]) => any>(() => ""),
  workspaceInvalidationState: {
    listeners: [] as Array<
      (payload: {
        workspacePath: string;
        kind: "fs" | "git" | "full";
        source: "watcher" | "fallback" | "lifecycle";
        version: number;
      }) => void
    >,
    reset() {
      this.listeners = [];
    },
    subscribe(
      listener: (payload: {
        workspacePath: string;
        kind: "fs" | "git" | "full";
        source: "watcher" | "fallback" | "lifecycle";
        version: number;
      }) => void,
    ) {
      this.listeners.push(listener);
      return () => {
        this.listeners = this.listeners.filter((currentListener) => currentListener !== listener);
      };
    },
  },
  setSessionProjectDirMock: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
}));

const sessionState = {
  selectedArtifactContext: null,
  selectedFilePath: null,
  selectedDiffPath: null,
  viewMode: "preview",
  sections: {
    files: true,
    git: true,
    artifacts: true,
  },
};

const sidepanelStore = {
  open: true,
  toggleSection: toggleSectionMock,
  clearArtifact: clearArtifactMock,
  clearFile: clearFileMock,
  clearDiff: clearDiffMock,
  selectFile: selectFileMock,
  selectDiff: selectDiffMock,
  getSessionState: () => sessionState,
};

const artifactStore = {
  currentArtifact: null,
  currentMessageId: null,
  currentThreadId: null,
  showArtifact: showArtifactMock,
};

const messageStore = {
  messages: [
    {
      id: "m1",
      sessionId: "s1",
      orderSeq: 1,
      role: "assistant",
      content: JSON.stringify([
        {
          type: "content",
          status: "success",
          timestamp: 1,
          content:
            '<antArtifact type="text/markdown" identifier="artifact-1" title="Workspace Doc"># Hello</antArtifact>',
        },
      ]),
      status: "sent",
      isContextEdge: 0,
      metadata: "{}",
      createdAt: 10,
      updatedAt: 10,
    },
  ],
  getAssistantMessageBlocks: (message: { content: string }) => JSON.parse(message.content),
};

const emitWorkspaceInvalidated = async (payload: {
  workspacePath: string;
  kind: "fs" | "git" | "full";
  source: "watcher" | "fallback" | "lifecycle";
  version?: number;
}) => {
  for (const listener of workspaceInvalidationState.listeners) {
    listener({
      version: 1,
      ...payload,
    });
  }
  await act(async () => {});
};

vi.mock("@iconify/react", () => ({
  Icon: () => null,
}));

vi.mock("@/stores/artifact", () => ({
  useArtifactStore: () => artifactStore,
}));

vi.mock("@/stores/ui/message", () => ({
  useMessageStore: () => messageStore,
}));

vi.mock("@/stores/ui/sidepanel", () => ({
  useSidepanelStore: () => sidepanelStore,
}));

vi.mock("@api/WorkspaceClient", () => ({
  createWorkspaceClient: vi.fn<(...args: any[]) => any>(() => ({
    registerWorkspace: registerWorkspaceMock,
    watchWorkspace: watchWorkspaceMock,
    unwatchWorkspace: unwatchWorkspaceMock,
    readDirectory: readDirectoryMock,
    getGitStatus: getGitStatusMock,
    readFilePreview: readFilePreviewMock,
    getGitDiff: getGitDiffMock,
    expandDirectory: expandDirectoryMock,
    openFile: openFileMock,
    revealFileInFolder: revealFileInFolderMock,
    onInvalidated: vi.fn<(...args: any[]) => any>((listener: (payload: unknown) => void) =>
      workspaceInvalidationState.subscribe(listener as any),
    ),
  })),
}));

vi.mock("@api/ProjectClient", () => ({
  createProjectClient: vi.fn<(...args: any[]) => any>(() => ({
    selectDirectory: selectDirectoryMock,
  })),
}));

vi.mock("@api/FileClient", () => ({
  createFileClient: vi.fn<(...args: any[]) => any>(() => ({
    isDirectory: isDirectoryMock,
    getPathForFile: getPathForFileMock,
  })),
}));

vi.mock("@/stores/ui/session", () => ({
  useSessionStore: () => ({
    setSessionProjectDir: setSessionProjectDirMock,
  }),
}));

vi.mock("@/components/workspace/WorkspaceFileNode", () => ({
  default: ({
    node,
    onToggle,
    onInsertPath,
  }: {
    node: { name: string; path: string; isDirectory: boolean; children?: any[] };
    onToggle?: (node: any) => void;
    onInsertPath?: (path: string) => void;
  }) => (
    <div className="workspace-file-node-stub">
      <button className="node-toggle" type="button" onClick={() => onToggle?.(node)}>
        {node.name}
      </button>
      <button className="node-insert" type="button" onClick={() => onInsertPath?.(node.path)}>
        Insert
      </button>
      {node.children && (
        <div>
          {node.children.map((child: any) => (
            <div key={child.path} className="node-child">
              {child.name}
            </div>
          ))}
        </div>
      )}
    </div>
  ),
}));

vi.mock("@/components/sidepanel/WorkspaceViewer", () => ({
  default: () => <div className="workspace-viewer-stub" />,
}));

describe("WorkspacePanel", () => {
  beforeEach(() => {
    vi.useFakeTimers();

    workspaceInvalidationState.reset();
    sidepanelStore.open = true;
    sessionState.selectedArtifactContext = null;
    sessionState.selectedFilePath = null;
    sessionState.selectedDiffPath = null;
    sessionState.sections.files = true;
    sessionState.sections.git = true;
    sessionState.sections.artifacts = true;
    artifactStore.currentArtifact = null;
    artifactStore.currentMessageId = null;
    artifactStore.currentThreadId = null;

    showArtifactMock.mockReset();
    toggleSectionMock.mockReset();
    clearArtifactMock.mockReset();
    clearFileMock.mockReset();
    clearDiffMock.mockReset();
    selectFileMock.mockReset();
    selectDiffMock.mockReset();
    registerWorkspaceMock.mockReset().mockResolvedValue(undefined);
    watchWorkspaceMock.mockReset().mockResolvedValue(undefined);
    unwatchWorkspaceMock.mockReset().mockResolvedValue(undefined);
    readDirectoryMock.mockReset().mockResolvedValue([]);
    getGitStatusMock.mockReset().mockResolvedValue({
      workspacePath: "C:/repo",
      branch: "main",
      ahead: 0,
      behind: 0,
      changes: [],
    });
    readFilePreviewMock.mockReset().mockResolvedValue(null);
    getGitDiffMock.mockReset().mockResolvedValue(null);
    expandDirectoryMock.mockReset().mockResolvedValue([]);
    openFileMock.mockReset().mockResolvedValue(undefined);
    revealFileInFolderMock.mockReset().mockResolvedValue(undefined);
    selectDirectoryMock.mockReset().mockResolvedValue(null);
    isDirectoryMock.mockReset().mockResolvedValue(true);
    getPathForFileMock.mockReset().mockReturnValue("");
    setSessionProjectDirMock.mockReset().mockResolvedValue(undefined);
  });

  it("extracts artifact items from assistant blocks and opens preview context", async () => {
    const onInsertFileReference = vi.fn<(...args: any[]) => any>();
    const onUpdateWorkspacePath = vi.fn<(...args: any[]) => any>();
    const { container, unmount } = render(
      <WorkspacePanel
        sessionId="s1"
        workspacePath="C:/repo"
        onInsertFileReference={onInsertFileReference}
        onUpdateWorkspacePath={onUpdateWorkspacePath}
      />,
    );

    await act(async () => {});

    expect(container.textContent).toContain("Workspace Doc");

    const artifactButton = screen
      .getAllByRole("button")
      .find((button) => button.textContent?.includes("Workspace Doc"));
    expect(artifactButton).toBeTruthy();

    await act(async () => {
      fireEvent.click(artifactButton!);
    });

    expect(showArtifactMock).toHaveBeenCalledWith(
      {
        id: "artifact-1",
        type: "text/markdown",
        title: "Workspace Doc",
        language: undefined,
        content: "# Hello",
        status: "loaded",
      },
      "m1",
      "s1",
      {
        force: true,
        open: false,
        viewMode: "preview",
      },
    );

    unmount();
  });

  it("does not render a subagent section in the workspace navigation", async () => {
    const { container, unmount } = render(<WorkspacePanel sessionId="s1" workspacePath="C:/repo" />);

    await act(async () => {});

    expect(container.textContent).not.toContain("chat.workspace.sections.subagents");

    unmount();
  });

  it("emits insertion requests separately from preview selection", async () => {
    readDirectoryMock.mockResolvedValueOnce([
      {
        name: "README.md",
        path: "C:/repo/README.md",
        isDirectory: false,
      },
    ]);

    const onInsertFileReference = vi.fn<(...args: any[]) => any>();
    const { unmount } = render(
      <WorkspacePanel sessionId="s1" workspacePath="C:/repo" onInsertFileReference={onInsertFileReference} />,
    );

    await act(async () => {});

    const insertButton = screen.getByRole("button", { name: /Insert/ });
    await act(async () => {
      fireEvent.click(insertButton);
    });

    expect(onInsertFileReference).toHaveBeenCalledWith("C:/repo/README.md");
    expect(selectFileMock).not.toHaveBeenCalled();

    unmount();
  });

  it("starts and stops workspace watchers with panel lifecycle", async () => {
    const { unmount } = render(<WorkspacePanel sessionId="s1" workspacePath="C:/repo" />);

    await act(async () => {});

    expect(registerWorkspaceMock).toHaveBeenCalledWith("C:/repo");
    expect(watchWorkspaceMock).toHaveBeenCalledWith("C:/repo");

    unmount();
    await act(async () => {});

    expect(unwatchWorkspaceMock).toHaveBeenCalledWith("C:/repo");
  });

  it("keeps expanded directories expanded after a full invalidation refresh", async () => {
    readDirectoryMock
      .mockResolvedValueOnce([
        {
          name: "src",
          path: "C:/repo/src",
          isDirectory: true,
          expanded: false,
        },
      ])
      .mockResolvedValueOnce([
        {
          name: "src",
          path: "C:/repo/src",
          isDirectory: true,
          expanded: false,
        },
      ]);
    expandDirectoryMock.mockResolvedValue([
      {
        name: "child.ts",
        path: "C:/repo/src/child.ts",
        isDirectory: false,
      },
    ]);

    const { container, unmount } = render(<WorkspacePanel sessionId="s1" workspacePath="C:/repo" />);

    await act(async () => {});

    const nodeButton = screen.getByRole("button", { name: /src/ });
    await act(async () => {
      fireEvent.click(nodeButton);
    });
    await act(async () => {});

    expect(expandDirectoryMock).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("child.ts");

    await emitWorkspaceInvalidated({
      workspacePath: "C:/repo",
      kind: "full",
      source: "watcher",
    });
    await act(async () => {
      vi.advanceTimersByTime(120);
    });
    await act(async () => {});

    expect(readDirectoryMock).toHaveBeenCalledTimes(2);
    expect(expandDirectoryMock).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("child.ts");

    unmount();
  });

  it("sets the workspace when a directory is dropped", async () => {
    const onUpdateWorkspacePath = vi.fn<(...args: any[]) => any>();
    const { container, unmount } = render(
      <WorkspacePanel sessionId="s1" workspacePath={null} onUpdateWorkspacePath={onUpdateWorkspacePath} />,
    );

    await act(async () => {});

    const file = new File([""], "repo");
    getPathForFileMock.mockReturnValue("/tmp/workspace");

    const dropZone = container.querySelector('[class*="border-dashed"]')!;
    await act(async () => {
      fireEvent.drop(dropZone, {
        dataTransfer: {
          files: [file],
        },
      });
    });
    await act(async () => {});

    expect(getPathForFileMock).toHaveBeenCalledWith(file);
    expect(isDirectoryMock).toHaveBeenCalledWith("/tmp/workspace");
    expect(setSessionProjectDirMock).toHaveBeenCalledWith("s1", "/tmp/workspace");
    expect(onUpdateWorkspacePath).toHaveBeenCalledWith("/tmp/workspace");

    unmount();
  });

  it("ignores dropped files that are not directories", async () => {
    isDirectoryMock.mockResolvedValue(false);

    const onUpdateWorkspacePath = vi.fn<(...args: any[]) => any>();
    const { container, unmount } = render(
      <WorkspacePanel sessionId="s1" workspacePath={null} onUpdateWorkspacePath={onUpdateWorkspacePath} />,
    );

    await act(async () => {});

    const file = new File(["hello"], "README.md", { type: "text/markdown" });
    getPathForFileMock.mockReturnValue("/tmp/workspace/README.md");

    const dropZone = container.querySelector('[class*="border-dashed"]')!;
    await act(async () => {
      fireEvent.drop(dropZone, {
        dataTransfer: {
          files: [file],
        },
      });
    });
    await act(async () => {});

    expect(isDirectoryMock).toHaveBeenCalledWith("/tmp/workspace/README.md");
    expect(setSessionProjectDirMock).not.toHaveBeenCalled();
    expect(onUpdateWorkspacePath).not.toHaveBeenCalled();

    unmount();
  });

  it("refreshes only git state for git invalidations", async () => {
    const { unmount } = render(<WorkspacePanel sessionId="s1" workspacePath="C:/repo" />);

    await act(async () => {});

    expect(readDirectoryMock).toHaveBeenCalledTimes(1);
    expect(getGitStatusMock).toHaveBeenCalledTimes(1);

    await emitWorkspaceInvalidated({
      workspacePath: "C:/repo",
      kind: "git",
      source: "watcher",
    });
    await act(async () => {
      vi.advanceTimersByTime(120);
    });
    await act(async () => {});

    expect(readDirectoryMock).toHaveBeenCalledTimes(1);
    expect(getGitStatusMock).toHaveBeenCalledTimes(2);
    expect(readFilePreviewMock).not.toHaveBeenCalled();

    unmount();
  });

  it("clears stale file and diff selections after a full refresh", async () => {
    sessionState.selectedFilePath = "C:/repo/src/app.ts";
    sessionState.selectedDiffPath = "C:/repo/src/app.ts";

    readFilePreviewMock
      .mockResolvedValueOnce({
        path: "C:/repo/src/app.ts",
        relativePath: "src/app.ts",
        name: "app.ts",
        mimeType: "text/plain",
        kind: "text",
        content: "hello",
        language: "ts",
        metadata: {
          fileName: "app.ts",
          fileSize: 5,
          fileCreated: new Date("2024-01-01"),
          fileModified: new Date("2024-01-01"),
        },
      })
      .mockResolvedValueOnce({
        path: "C:/repo/src/app.ts",
        relativePath: "src/app.ts",
        name: "app.ts",
        mimeType: "text/plain",
        kind: "text",
        content: "hello",
        language: "ts",
        metadata: {
          fileName: "app.ts",
          fileSize: 5,
          fileCreated: new Date("2024-01-01"),
          fileModified: new Date("2024-01-01"),
        },
      })
      .mockResolvedValueOnce(null);

    getGitStatusMock
      .mockResolvedValueOnce({
        workspacePath: "C:/repo",
        branch: "main",
        ahead: 0,
        behind: 0,
        changes: [
          {
            path: "C:/repo/src/app.ts",
            relativePath: "src/app.ts",
            stagedStatus: null,
            unstagedStatus: "M",
            type: "modified",
          },
        ],
      })
      .mockResolvedValueOnce({
        workspacePath: "C:/repo",
        branch: "main",
        ahead: 0,
        behind: 0,
        changes: [],
      });

    getGitDiffMock
      .mockResolvedValueOnce({
        workspacePath: "C:/repo",
        filePath: "C:/repo/src/app.ts",
        relativePath: "src/app.ts",
        staged: "",
        unstaged: "diff --git a/src/app.ts b/src/app.ts",
      })
      .mockResolvedValueOnce({
        workspacePath: "C:/repo",
        filePath: "C:/repo/src/app.ts",
        relativePath: "src/app.ts",
        staged: "",
        unstaged: "diff --git a/src/app.ts b/src/app.ts",
      });

    const { unmount } = render(<WorkspacePanel sessionId="s1" workspacePath="C:/repo" />);

    await act(async () => {});

    expect(clearFileMock).not.toHaveBeenCalled();
    expect(clearDiffMock).not.toHaveBeenCalled();

    await emitWorkspaceInvalidated({
      workspacePath: "C:/repo",
      kind: "full",
      source: "watcher",
    });
    await act(async () => {
      vi.advanceTimersByTime(120);
    });
    await act(async () => {});

    expect(clearFileMock).toHaveBeenCalledWith("s1");
    expect(clearDiffMock).toHaveBeenCalledWith("s1");

    unmount();
  });

  it("keeps the current temporary artifact selection when it is not part of artifact items", async () => {
    sessionState.selectedArtifactContext = {
      threadId: "s1",
      messageId: "C:/repo/README.md",
      artifactId: "temp-html-preview",
    };
    artifactStore.currentArtifact = {
      id: "temp-html-preview",
      type: "text/html",
      title: "HTML Preview",
      content: "<h1>Hello</h1>",
      status: "loaded",
    };
    artifactStore.currentMessageId = "C:/repo/README.md";
    artifactStore.currentThreadId = "s1";

    const { unmount } = render(<WorkspacePanel sessionId="s1" workspacePath="C:/repo" />);

    await act(async () => {});

    expect(clearArtifactMock).not.toHaveBeenCalled();

    unmount();
  });
});
