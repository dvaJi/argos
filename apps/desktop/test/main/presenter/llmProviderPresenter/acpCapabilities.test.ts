import { describe, it, expect } from "vitest";
import { buildCapabilitySnapshot, buildClientCapabilities } from "@argos/acp-runtime";

describe("AcpCapabilities", () => {
  describe("buildClientCapabilities", () => {
    it("enables fs and terminal by default", () => {
      const caps = buildClientCapabilities();

      expect(caps.fs).toEqual({
        readTextFile: true,
        writeTextFile: true,
      });
      expect(caps.terminal).toBe(true);
    });

    it("allows disabling fs capabilities", () => {
      const caps = buildClientCapabilities({ enableFs: false });

      expect(caps.fs).toBeUndefined();
      expect(caps.terminal).toBe(true);
    });

    it("allows disabling terminal capabilities", () => {
      const caps = buildClientCapabilities({ enableTerminal: false });

      expect(caps.fs).toEqual({
        readTextFile: true,
        writeTextFile: true,
      });
      expect(caps.terminal).toBeUndefined();
    });

    it("allows disabling all capabilities", () => {
      const caps = buildClientCapabilities({
        enableFs: false,
        enableTerminal: false,
      });

      expect(caps.fs).toBeUndefined();
      expect(caps.terminal).toBeUndefined();
    });

    it("advertises terminal auth only when enabled", () => {
      expect(buildClientCapabilities().auth).toBeUndefined();
      expect(buildClientCapabilities({ enableTerminalAuth: true }).auth).toEqual({
        terminal: true,
      });
      expect(buildClientCapabilities({ enableTerminal: false, enableTerminalAuth: true }).auth).toBeUndefined();
    });

    it("advertises handled live-update capabilities and nothing unhandled", () => {
      const caps = buildClientCapabilities();

      expect(caps.plan).toEqual({});
      expect(caps.session).toEqual({
        compaction: {},
        notices: {},
        promptSuggestions: {},
        cursors: {},
      });
      // Elicitation supports form dialogs and the URL card (open browser +
      // mark complete, auto-accepted on the agent's elicitation/complete).
      expect(caps.elicitation).toEqual({ form: {}, url: {} });
      expect(caps.subagents).toEqual({});
    });
  });

  describe("buildCapabilitySnapshot", () => {
    it("normalizes initialize capabilities into support flags", () => {
      const snapshot = buildCapabilitySnapshot({
        protocolVersion: 1,
        agentInfo: { name: "dimcode", version: "0.0.75" },
        authMethods: [{ id: "login", name: "Login" }],
        agentCapabilities: {
          loadSession: true,
          promptCapabilities: {
            image: true,
            audio: false,
            embeddedContext: true,
          },
          mcpCapabilities: {
            http: true,
            sse: false,
          },
          sessionCapabilities: {
            list: {},
            resume: {},
            close: {},
            delete: {},
            archive: {},
            status: {},
          },
        },
      });

      expect(snapshot.agentInfo?.name).toBe("dimcode");
      expect(snapshot.authMethods).toHaveLength(1);
      expect(snapshot.promptCapabilities?.image).toBe(true);
      expect(snapshot.mcpCapabilities).toEqual({ http: true, sse: false });
      expect(snapshot.supports).toEqual({
        loadSession: true,
        sessionList: true,
        sessionResume: true,
        sessionClose: true,
        sessionFork: false,
        sessionDelete: true,
        sessionArchive: true,
        sessionStatus: true,
        sessionTitle: false,
        authLogout: false,
      });
    });
  });
});
