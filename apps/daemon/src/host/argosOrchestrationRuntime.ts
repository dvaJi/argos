import { randomUUID } from "node:crypto";
import type { MCPToolCall, MCPToolDefinition, MCPToolResponse } from "@argos/shared/types/core/mcp";

type Database = any;
type SessionActions = {
  send(sessionId: string, text: string): Promise<unknown>;
  steer(sessionId: string, text: string): Promise<void>;
  stop(sessionId: string): Promise<void>;
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
    ];
  }

  handles(name: string): boolean {
    return this.definitions().some((item) => item.function.name === name);
  }

  setSessionActions(actions: SessionActions): void {
    this.sessionActions = actions;
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
      default:
        throw new Error(`Unknown Argos orchestration tool: ${request.function.name}`);
    }
    return { toolCallId: request.id, content: [{ type: "text", text: JSON.stringify(result) }], toolResult: result };
  }
}
