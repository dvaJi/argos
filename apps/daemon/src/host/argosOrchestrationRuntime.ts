import { randomUUID } from "node:crypto";
import type { MCPToolCall, MCPToolDefinition, MCPToolResponse } from "@argos/shared/types/core/mcp";

type Database = any;
type SessionActions = {
  send(sessionId: string, text: string): Promise<unknown>;
  steer(sessionId: string, text: string): Promise<void>;
  stop(sessionId: string): Promise<void>;
};

type ProvisioningActions = {
  createAgent(input: Record<string, unknown>): Promise<unknown>;
  updateAgent(agentId: string, updates: Record<string, unknown>): Promise<unknown>;
  listMcpServers(): Promise<unknown>;
  upsertMcpServer(serverName: string, config: Record<string, unknown>): Promise<unknown>;
  setAgentMcpServers(agentId: string, serverNames: string[]): Promise<unknown>;
  listAgentSkills(agentId: string): Promise<unknown>;
  writeAgentSkill(
    agentId: string,
    input: { name: string; description: string; instructions: string },
  ): Promise<unknown>;
  removeAgentSkill(agentId: string, name: string): Promise<unknown>;
  provisionAgent(input: Record<string, unknown>): Promise<unknown>;
  validateAgent(agentId: string): Promise<unknown>;
};

const tool = (
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required?: string[],
): MCPToolDefinition => ({
  type: "function",
  source: "agent",
  function: { name, description, parameters: { type: "object", properties, required } },
  server: { name: "argos-orchestration", icons: "", description: "Argos projects, tasks, and agent coordination" },
});

export class ArgosOrchestrationRuntime {
  private sessionActions?: SessionActions;
  private provisioningActions?: ProvisioningActions;

  constructor(
    private readonly db: Database,
    private readonly listAgents: () => Promise<unknown[]>,
  ) {
    db.exec(
      `CREATE TABLE IF NOT EXISTS argos_orchestration_projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT, description TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
    );
    db.exec(
      `CREATE TABLE IF NOT EXISTS argos_orchestration_tasks (id TEXT PRIMARY KEY, project_id TEXT, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'todo', assignee_agent_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
    );
  }

  definitions(): MCPToolDefinition[] {
    return [
      tool("argos_projects_list", "List Argos orchestration projects.", {}),
      tool(
        "argos_projects_create",
        "Create an Argos orchestration project.",
        { name: { type: "string" }, path: { type: "string" }, description: { type: "string" } },
        ["name"],
      ),
      tool("argos_tasks_list", "List tasks, optionally for one project.", {
        projectId: { type: "string" },
        status: { type: "string" },
      }),
      tool(
        "argos_tasks_create",
        "Create a task and optionally assign it to an Argos agent.",
        {
          title: { type: "string" },
          projectId: { type: "string" },
          description: { type: "string" },
          assigneeAgentId: { type: "string" },
        },
        ["title"],
      ),
      tool("argos_sessions_list", "List Argos sessions, optionally for one agent.", { agentId: { type: "string" } }),
      tool("argos_session_get", "Get an Argos session's current metadata.", { sessionId: { type: "string" } }, [
        "sessionId",
      ]),
      tool(
        "argos_session_messages_list",
        "Read messages from an Argos session.",
        { sessionId: { type: "string" }, limit: { type: "number" } },
        ["sessionId"],
      ),
      tool(
        "argos_session_send_message",
        "Send a message to an existing Argos session and continue its agent run.",
        { sessionId: { type: "string" }, text: { type: "string" } },
        ["sessionId", "text"],
      ),
      tool(
        "argos_session_steer",
        "Steer the active run of an Argos session.",
        { sessionId: { type: "string" }, text: { type: "string" } },
        ["sessionId", "text"],
      ),
      tool("argos_session_stop", "Stop the active run of an Argos session.", { sessionId: { type: "string" } }, [
        "sessionId",
      ]),
      tool("argos_agents_list", "List Argos agents available for delegation.", {}),
      tool(
        "argos_agents_create",
        "Create a custom Argos agent. Pass config to set its prompt, model, permissions, tools, MCP servers, plugins, skills, memory, or subagents.",
        {
          name: { type: "string" },
          description: { type: "string" },
          enabled: { type: "boolean" },
          config: { type: "object", additionalProperties: true },
        },
        ["name"],
      ),
      tool(
        "argos_agents_update",
        "Update a custom Argos agent or the orchestrator itself. The default protected Argos agent cannot be changed here.",
        {
          agentId: { type: "string" },
          updates: { type: "object", additionalProperties: true },
        },
        ["agentId", "updates"],
      ),
      tool("argos_mcp_servers_list", "List globally configured MCP servers and their current configuration.", {}),
      tool(
        "argos_mcp_server_upsert",
        "Add or update and start an MCP server. Environment values are persisted in the existing Argos MCP configuration; never place secrets in skill instructions.",
        {
          serverName: { type: "string" },
          config: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["stdio", "sse", "http"] },
              command: { type: "string" },
              args: { type: "array", items: { type: "string" } },
              env: { type: "object", additionalProperties: true },
              baseUrl: { type: "string" },
              customHeaders: { type: "object", additionalProperties: { type: "string" } },
              descriptions: { type: "string" },
              enabled: { type: "boolean" },
            },
            additionalProperties: true,
          },
        },
        ["serverName", "config"],
      ),
      tool(
        "argos_agent_mcp_servers_set",
        "Replace an agent's MCP server allowlist. An empty list gives the agent no MCP servers.",
        {
          agentId: { type: "string" },
          serverNames: { type: "array", items: { type: "string" } },
        },
        ["agentId", "serverNames"],
      ),
      tool(
        "argos_agent_skills_list",
        "List disk-backed Argos-managed skills attached to one agent, including hash and managed version.",
        { agentId: { type: "string" } },
        ["agentId"],
      ),
      tool(
        "argos_agent_skill_write",
        "Create or update an agent-specific skill under its managed .argos/skills directory and attach it to that agent.",
        {
          agentId: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          instructions: { type: "string" },
        },
        ["agentId", "name", "description", "instructions"],
      ),
      tool(
        "argos_agent_skill_remove",
        "Remove an Argos-managed skill from one agent and detach it from that agent's skill allowlist.",
        { agentId: { type: "string" }, name: { type: "string" } },
        ["agentId", "name"],
      ),
      tool(
        "argos_agent_provision",
        "Atomically create and validate a specialized agent with MCP servers and durable managed skills. The incomplete agent and MCP changes are rolled back on failure.",
        {
          name: { type: "string" },
          description: { type: "string" },
          enabled: { type: "boolean" },
          config: { type: "object", additionalProperties: true },
          mcpServers: {
            type: "array",
            items: {
              type: "object",
              properties: {
                serverName: { type: "string" },
                config: { type: "object", additionalProperties: true },
              },
              required: ["serverName", "config"],
            },
          },
          skills: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                description: { type: "string" },
                instructions: { type: "string" },
              },
              required: ["name", "description", "instructions"],
            },
          },
        },
        ["name"],
      ),
      tool(
        "argos_agent_validate",
        "Validate an Argos agent's model, MCP configuration/runtime, allowlists, managed skill files, and enabled state.",
        { agentId: { type: "string" } },
        ["agentId"],
      ),
    ];
  }

  handles(name: string): boolean {
    return this.definitions().some((item) => item.function.name === name);
  }

  setSessionActions(actions: SessionActions): void {
    this.sessionActions = actions;
  }

  setProvisioningActions(actions: ProvisioningActions): void {
    this.provisioningActions = actions;
  }

  async call(request: MCPToolCall): Promise<MCPToolResponse> {
    const args = JSON.parse(request.function.arguments || "{}") as Record<string, unknown>;
    const now = Date.now();
    let result: unknown;
    switch (request.function.name) {
      case "argos_projects_list":
        result = this.db
          .prepare(
            "SELECT id, name, path, description, created_at AS createdAt, updated_at AS updatedAt FROM argos_orchestration_projects ORDER BY updated_at DESC",
          )
          .all();
        break;
      case "argos_projects_create": {
        const id = randomUUID();
        this.db
          .prepare(
            "INSERT INTO argos_orchestration_projects (id,name,path,description,created_at,updated_at) VALUES (?,?,?,?,?,?)",
          )
          .run(
            id,
            String(args.name),
            typeof args.path === "string" ? args.path : null,
            typeof args.description === "string" ? args.description : "",
            now,
            now,
          );
        result = this.db
          .prepare(
            "SELECT id, name, path, description, created_at AS createdAt, updated_at AS updatedAt FROM argos_orchestration_projects WHERE id=?",
          )
          .get(id);
        break;
      }
      case "argos_tasks_list": {
        const clauses: string[] = [];
        const values: string[] = [];
        if (typeof args.projectId === "string") {
          clauses.push("project_id=?");
          values.push(args.projectId);
        }
        if (typeof args.status === "string") {
          clauses.push("status=?");
          values.push(args.status);
        }
        result = this.db
          .prepare(
            `SELECT id, project_id AS projectId, title, description, status, assignee_agent_id AS assigneeAgentId, created_at AS createdAt, updated_at AS updatedAt FROM argos_orchestration_tasks ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""} ORDER BY updated_at DESC`,
          )
          .all(...values);
        break;
      }
      case "argos_tasks_create": {
        const id = randomUUID();
        this.db
          .prepare(
            "INSERT INTO argos_orchestration_tasks (id,project_id,title,description,status,assignee_agent_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
          )
          .run(
            id,
            typeof args.projectId === "string" ? args.projectId : null,
            String(args.title),
            typeof args.description === "string" ? args.description : "",
            "todo",
            typeof args.assigneeAgentId === "string" ? args.assigneeAgentId : null,
            now,
            now,
          );
        result = this.db
          .prepare(
            "SELECT id, project_id AS projectId, title, description, status, assignee_agent_id AS assigneeAgentId, created_at AS createdAt, updated_at AS updatedAt FROM argos_orchestration_tasks WHERE id=?",
          )
          .get(id);
        break;
      }
      case "argos_sessions_list":
        result =
          typeof args.agentId === "string"
            ? this.db
                .prepare(
                  "SELECT id, agent_id AS agentId, title, project_dir AS projectDir, status, updated_at AS updatedAt FROM daemon_sessions WHERE agent_id=? ORDER BY updated_at DESC LIMIT 100",
                )
                .all(args.agentId)
            : this.db
                .prepare(
                  "SELECT id, agent_id AS agentId, title, project_dir AS projectDir, status, updated_at AS updatedAt FROM daemon_sessions ORDER BY updated_at DESC LIMIT 100",
                )
                .all();
        break;
      case "argos_session_get":
        result = this.db
          .prepare(
            "SELECT id, agent_id AS agentId, title, project_dir AS projectDir, status, provider_id AS providerId, model_id AS modelId, updated_at AS updatedAt FROM daemon_sessions WHERE id=?",
          )
          .get(String(args.sessionId));
        break;
      case "argos_session_messages_list":
        result = this.db
          .prepare(
            "SELECT id, role, content, created_at AS createdAt, updated_at AS updatedAt FROM daemon_messages WHERE session_id=? ORDER BY created_at ASC LIMIT ?",
          )
          .all(String(args.sessionId), Math.min(Math.max(Number(args.limit) || 100, 1), 500));
        break;
      case "argos_session_send_message":
        if (!this.sessionActions) throw new Error("Argos session control is not ready.");
        result = await this.sessionActions.send(String(args.sessionId), String(args.text));
        break;
      case "argos_session_steer":
        if (!this.sessionActions) throw new Error("Argos session control is not ready.");
        await this.sessionActions.steer(String(args.sessionId), String(args.text));
        result = { steered: true };
        break;
      case "argos_session_stop":
        if (!this.sessionActions) throw new Error("Argos session control is not ready.");
        await this.sessionActions.stop(String(args.sessionId));
        result = { stopped: true };
        break;
      case "argos_agents_list":
        result = await this.listAgents();
        break;
      case "argos_agents_create":
        result = await this.requireProvisioning().createAgent({
          name: String(args.name),
          ...(typeof args.description === "string" ? { description: args.description } : {}),
          ...(typeof args.enabled === "boolean" ? { enabled: args.enabled } : {}),
          ...(this.asRecord(args.config) ? { config: this.asRecord(args.config) } : {}),
        });
        break;
      case "argos_agents_update":
        result = await this.requireProvisioning().updateAgent(String(args.agentId), this.asRecord(args.updates) ?? {});
        break;
      case "argos_mcp_servers_list":
        result = await this.requireProvisioning().listMcpServers();
        break;
      case "argos_mcp_server_upsert":
        result = await this.requireProvisioning().upsertMcpServer(
          String(args.serverName),
          this.asRecord(args.config) ?? {},
        );
        break;
      case "argos_agent_mcp_servers_set":
        result = await this.requireProvisioning().setAgentMcpServers(
          String(args.agentId),
          Array.isArray(args.serverNames) ? args.serverNames.map(String) : [],
        );
        break;
      case "argos_agent_skills_list":
        result = await this.requireProvisioning().listAgentSkills(String(args.agentId));
        break;
      case "argos_agent_skill_write":
        result = await this.requireProvisioning().writeAgentSkill(String(args.agentId), {
          name: String(args.name),
          description: String(args.description),
          instructions: String(args.instructions),
        });
        break;
      case "argos_agent_skill_remove":
        result = await this.requireProvisioning().removeAgentSkill(String(args.agentId), String(args.name));
        break;
      case "argos_agent_provision":
        result = await this.requireProvisioning().provisionAgent(args);
        break;
      case "argos_agent_validate":
        result = await this.requireProvisioning().validateAgent(String(args.agentId));
        break;
      default:
        throw new Error(`Unknown Argos orchestration tool: ${request.function.name}`);
    }
    return { toolCallId: request.id, content: [{ type: "text", text: JSON.stringify(result) }], toolResult: result };
  }

  private requireProvisioning(): ProvisioningActions {
    if (!this.provisioningActions) throw new Error("Argos provisioning is not ready.");
    return this.provisioningActions;
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  }
}
