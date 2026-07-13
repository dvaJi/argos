import { describe, it, expect, vi, beforeEach } from "vitest";
import { useArtifactExport } from "#/composables/useArtifactExport";

vi.mock("mermaid", () => ({
  default: {
    render: vi.fn<(...args: any[]) => any>().mockResolvedValue({ svg: "<svg></svg>" }),
  },
}));

// jsdom helpers for blob download
beforeEach(() => {
  // @ts-ignore
  global.URL.createObjectURL = vi.fn<(...args: any[]) => any>(() => "blob://x");
  // @ts-ignore
  global.URL.revokeObjectURL = vi.fn<(...args: any[]) => any>();
  vi.spyOn<(...args: any[]) => any>(document.body, "appendChild");
  vi.spyOn<(...args: any[]) => any>(document.body, "removeChild");
});

const mkArtifact = (type: string, content: string, title = "artifact") => ({ type, content, title }) as any;

describe("useArtifactExport", () => {
  it("exports mermaid as SVG via download", async () => {
    const capture = vi.fn<(...args: any[]) => any>();
    const api = useArtifactExport(capture);
    await api.exportSVG(mkArtifact("application/vnd.ant.mermaid", "graph TD; A-->B;", "m1"));
    expect(document.body.appendChild).toHaveBeenCalled();
  });

  it("throws for invalid svg content", async () => {
    const api = useArtifactExport(vi.fn<(...args: any[]) => any>());
    await expect(api.exportSVG(mkArtifact("image/svg+xml", "NOT_SVG", "bad"))).rejects.toBeTruthy();
  });

  it("exports code and copies content", async () => {
    const api = useArtifactExport(vi.fn<(...args: any[]) => any>());
    // export code should trigger download
    await api.exportCode(mkArtifact("text/markdown", "# hello", "readme"));
    expect(document.body.appendChild).toHaveBeenCalled();

    // copy
    Object.assign(navigator, { clipboard: { writeText: vi.fn<(...args: any[]) => any>().mockResolvedValue(void 0) } });
    await api.copyContent(mkArtifact("application/vnd.ant.code", "hello world"));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("hello world");
  });

  it("copyAsImage delegates to captureAndCopy with proper config", async () => {
    const capture = vi.fn<(...args: any[]) => any>().mockResolvedValue(true);
    const api = useArtifactExport(capture);
    const ok = await api.copyAsImage(mkArtifact("text/plain", "content"), {
      isDark: false,
      version: "1.0.0",
      texts: { brand: "Argos", tip: "tip" },
    });
    expect(ok).toBe(true);
    expect(capture).toHaveBeenCalled();
  });
});
