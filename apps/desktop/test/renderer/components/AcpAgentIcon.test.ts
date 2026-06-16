import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";

const getAcpRegistryIconMarkup = vi.fn<(...args: any[]) => any>();

vi.mock("@api/ConfigClient", () => ({
  createConfigClient: vi.fn<(...args: any[]) => any>(() => ({
    getAcpRegistryIconMarkup,
  })),
}));

describe("AcpAgentIcon", () => {
  beforeEach(() => {
    getAcpRegistryIconMarkup.mockReset();
  });

  // TODO: flesh out React test — renders inline svg for registry icons, handles pending markup,
  // does not memoize empty results
  it("placeholder: module imports resolve", async () => {
    expect(true).toBe(true);
  });
});
