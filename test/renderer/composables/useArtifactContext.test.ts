import { describe, it, expect } from "vitest";
import { useArtifactContext } from "@/composables/useArtifactContext";

describe("useArtifactContext", () => {
  it("builds a stable context key from thread/message/artifact", () => {
    const art = { value: { id: "art-1" } } as { value: any };
    const threadId = { value: "t-1" } as { value: string | null };
    const messageId = { value: "m-1" } as { value: string | null };
    const { componentKey, activeArtifactContext } = useArtifactContext(art, threadId, messageId);

    expect(activeArtifactContext.value).toBe("t-1:m-1:art-1");
    const prevKey = componentKey.value;

    messageId.value = "m-2";
    art.value = { id: "art-1" };
    expect(activeArtifactContext.value).toBe("t-1:m-2:art-1");
    expect(componentKey.value).toBeGreaterThan(prevKey);

    art.value = null;
    expect(activeArtifactContext.value).toBeNull();
  });
});
