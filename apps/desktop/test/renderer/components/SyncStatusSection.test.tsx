import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SyncStatusSection from "#settings/components/skills/SyncStatusSection";
import type { ScanResult } from "@argos/shared/types/skillSync";

const mocks = vi.hoisted(() => ({
  scanExternalTools: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("#api/presenterBridge", () => ({
  useLegacyPresenter: () => ({ scanExternalTools: mocks.scanExternalTools }),
}));

vi.mock("#/components/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

const skill = (name: string) => ({
  name,
  path: `/skills/${name}`,
  format: "agents-skill",
  lastModified: new Date("2026-01-01T00:00:00Z"),
});

const scanResult = (overrides: Partial<ScanResult>): ScanResult => ({
  toolId: "codex",
  toolName: "OpenAI Codex",
  available: true,
  skillsDir: "/home/user/.codex/skills",
  skills: [skill("review"), skill("release")],
  ...overrides,
});

describe("SyncStatusSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows only detected external skill sources and imports their selected skills", async () => {
    const onImport = vi.fn();
    mocks.scanExternalTools.mockResolvedValue([
      scanResult({}),
      scanResult({
        toolId: "claude-code",
        toolName: "Claude Code",
        available: false,
        skills: [],
      }),
      scanResult({
        toolId: "cursor-project",
        toolName: "Cursor Project",
      }),
    ]);

    render(<SyncStatusSection onImport={onImport} />);

    expect(screen.getByText("External Skill Sources")).toBeInTheDocument();
    expect(screen.getByText(/these are not ACP agents/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scan external skill sources" })).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText("OpenAI Codex")).toBeInTheDocument());
    expect(screen.queryByText("Claude Code")).not.toBeInTheDocument();
    expect(screen.queryByText("Cursor Project")).not.toBeInTheDocument();
    expect(screen.getByText("2 skills found")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Import skills from OpenAI Codex" }));
    expect(onImport).toHaveBeenCalledWith("codex", ["review", "release"]);
  });

  it("explains an empty scan and allows rescanning", async () => {
    mocks.scanExternalTools.mockResolvedValue([
      scanResult({
        toolId: "claude-code",
        toolName: "Claude Code",
        available: false,
        skills: [],
      }),
    ]);

    render(<SyncStatusSection onImport={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("No External Skills Detected")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Scan Again" }));

    await waitFor(() => expect(mocks.scanExternalTools).toHaveBeenCalledTimes(2));
  });
});
