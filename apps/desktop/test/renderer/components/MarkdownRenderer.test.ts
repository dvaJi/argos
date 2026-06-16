import { describe, it, expect, vi } from "vitest";

vi.mock("@/stores/artifact", () => ({
  useArtifactStore: () => ({
    showArtifact: vi.fn<(...args: any[]) => any>(),
  }),
}));

vi.mock("@/stores/reference", () => ({
  useReferenceStore: () => ({
    hideReference: vi.fn<(...args: any[]) => any>(),
    showReference: vi.fn<(...args: any[]) => any>(),
  }),
}));

vi.mock("@/stores/theme", () => ({
  useThemeStore: () => ({
    isDark: false,
  }),
}));

vi.mock("@/stores/uiSettingsStore", () => ({
  useUiSettingsStore: () => ({
    formattedCodeFontFamily: "monospace",
  }),
}));

vi.mock("@api/SessionClient", () => ({
  createSessionClient: vi.fn<(...args: any[]) => any>(() => ({
    getSearchResults: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
  })),
}));

vi.mock("@/components/markdown/useMarkdownLinkNavigation", () => ({
  useMarkdownLinkNavigation: () => ({
    navigateLink: vi.fn<(...args: any[]) => any>().mockResolvedValue(true),
  }),
}));

describe("MarkdownRenderer", () => {
  it("placeholder — full React tests will be written in Phase 12", () => {
    expect(true).toBe(true);
  });
});
