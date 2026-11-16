/**
 * Argos-curated additions to the ACP community registry
 * (https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json).
 *
 * These agents are merged into every manifest snapshot (bundled seed, cached
 * snapshot, and upstream refresh) by `AcpRegistryService`. An upstream entry
 * with the same id always wins, so once an agent lands in the official
 * registry the curated copy is dropped automatically.
 *
 * Records use the exact bundled-registry JSON schema (`apps/desktop/resources/
 * acp-registry/registry.json`) and are normalized by the service before use.
 */
export const ACP_CURATED_AGENT_RECORDS: Array<Record<string, unknown>> = [
  {
    id: "command-code",
    name: "Command Code",
    // Required by the registry schema; informational only for npx agents
    // (the unpinned package below tracks the latest published release).
    version: "1.89.1",
    description:
      "Command Code's coding agent with native ACP support (`cmd acp`). Requires the Command Code CLI installed and signed in (`cmd login`, or COMMAND_CODE_API_KEY for headless auth).",
    repository: "https://github.com/CommandCodeAI/command-code",
    website: "https://commandcode.ai/docs/acp",
    authors: ["Command Code"],
    license: "proprietary",
    distribution: {
      npx: {
        // Unpinned: npx always runs the latest published release, so curated
        // entries never go stale between registry updates.
        package: "command-code",
        args: ["acp"],
      },
    },
  },
];
