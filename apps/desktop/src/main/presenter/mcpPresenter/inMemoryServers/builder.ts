import { AppleServer } from "./appleServer";
import {
  ArtifactsServer,
  AutoPromptingServer,
  BochaSearchServer,
  BraveSearchServer,
  DeepResearchServer,
  DifyKnowledgeServer,
  FastGptKnowledgeServer,
  RagflowKnowledgeServer,
} from "@argos/mcp-runtime";
import { presenter } from "#/presenter";

export function getInMemoryServer(serverName: string, _args: string[], env?: Record<string, unknown>) {
  switch (serverName) {
    // buildInFileSystem has been removed - filesystem capabilities are now provided via Agent tools
    case "Artifacts":
      return new ArtifactsServer();
    case "bochaSearch":
      return new BochaSearchServer(env);
    case "braveSearch":
      return new BraveSearchServer(env);
    case "deepResearch":
      return new DeepResearchServer(env, {
        getLanguage: () => presenter.configPresenter.getLanguage?.() || "zh-CN",
      });
    case "difyKnowledge":
      return new DifyKnowledgeServer(env);
    case "ragflowKnowledge":
      return new RagflowKnowledgeServer(env);
    case "fastGptKnowledge":
      return new FastGptKnowledgeServer(env);
    case "builtinKnowledge":
      // The built-in knowledge engine is daemon-hosted; the desktop runtime must
      // not own the DuckDB stores (single-owner constraint). See
      // docs/architecture/daemon-knowledge-runtime.
      throw new Error("builtinKnowledge is hosted by the daemon MCP runtime");
    case "argos-inmemory/deep-research-server":
      return new DeepResearchServer(env, {
        getLanguage: () => presenter.configPresenter.getLanguage?.() || "zh-CN",
      });
    case "argos-inmemory/auto-prompting-server":
      return new AutoPromptingServer({
        getCustomPrompts: () => presenter.configPresenter.getCustomPrompts(),
      });
    case "argos-inmemory/conversation-search-server":
      // Conversation-history search is daemon-hosted (reads the daemon DB via
      // the daemon MCP runtime); the desktop must not query a local database.
      throw new Error("argos-inmemory/conversation-search-server is hosted by the daemon MCP runtime");
    case "argos/apple-server":
      // Only create the AppleServer on macOS
      if (process.platform !== "darwin") {
        throw new Error("Apple Server is only supported on macOS");
      }
      return new AppleServer();
    default:
      throw new Error(`Unknown in-memory server: ${serverName}`);
  }
}
