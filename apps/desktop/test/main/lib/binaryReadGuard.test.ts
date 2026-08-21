import { describe, expect, it, vi, beforeEach } from "vitest";
import { shouldRejectAgentBinaryRead } from "../../../src/main/lib/binaryReadGuard";
import { isLikelyTextFile } from "@argos/file-adapters/mime";

vi.mock("@argos/file-adapters/mime", () => ({
  detectMimeType: vi.fn<(...args: any[]) => any>(),
  isLikelyTextFile: vi.fn<(...args: any[]) => any>(),
}));

describe("binaryReadGuard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("falls back to text detection for application/octet-stream", async () => {
    vi.mocked<(...args: any[]) => any>(isLikelyTextFile).mockResolvedValue(true);

    await expect(shouldRejectAgentBinaryRead("/tmp/maybe-text.bin", "application/octet-stream")).resolves.toBe(false);
  });

  it("still rejects octet-stream files that do not look like text", async () => {
    vi.mocked<(...args: any[]) => any>(isLikelyTextFile).mockResolvedValue(false);

    await expect(shouldRejectAgentBinaryRead("/tmp/blob.bin", "application/octet-stream")).resolves.toBe(true);
  });
});
