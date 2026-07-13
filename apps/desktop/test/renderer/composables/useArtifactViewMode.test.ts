import { describe, it, expect } from "vitest";
import { useArtifactViewMode } from "#/composables/useArtifactViewMode";

const mkArtifact = (id: string, type: string, status: "loaded" | "loading" | "error" = "loaded") =>
  ({
    id,
    type,
    status,
  }) as any;

describe("useArtifactViewMode", () => {
  it("auto-previews for certain types and reacts to changes", () => {
    const artifact = { value: mkArtifact("a1", "application/vnd.ant.mermaid") } as {
      value: any;
    };
    const { isPreview, setPreview } = useArtifactViewMode(artifact);
    expect(isPreview.value).toBe(true);

    setPreview(false);
    expect(isPreview.value).toBe(false);

    artifact.value = mkArtifact("a2", "image/svg+xml");
    expect(isPreview.value).toBe(true);

    artifact.value = mkArtifact("a3", "text/markdown");
    expect(isPreview.value).toBe(false);
  });

  it("depends on status: not preview until loaded", () => {
    const artifact = { value: mkArtifact("b1", "image/svg+xml", "loading") } as {
      value: any;
    };
    const vm = useArtifactViewMode(artifact);
    expect(vm.isPreview.value).toBe(false);
    artifact.value = mkArtifact("b1", "image/svg+xml", "loaded");
    expect(vm.isPreview.value).toBe(true);
  });
});
