/**
 * Automated self-test for the testbed ACP agent: drives it with the ACP SDK
 * client and feeds every update through Argos's real AcpContentMapper.
 *
 *   bun apps/desktop/testbed/selftest-acp.ts
 */
import { spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";
import path from "node:path";
import { client, ndJsonStream, PROTOCOL_VERSION } from "@agentclientprotocol/sdk/unstable";
import { AcpContentMapper } from "../../../packages/acp-runtime/src/index.ts";

const child = spawn("bun", [path.join(import.meta.dir, "acp-agent.ts")], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, TESTBED_ACP_TITLE_DELAY_MS: "1500" },
});
const agentLog: string[] = [];
child.stderr.on("data", (d) => agentLog.push(String(d)));
const mapper = new AcpContentMapper();
const updates: any[] = [];
const mapped: any[] = [];
let completeSeen = false;
const app = client({ name: "smoke" })
  .onNotification("session/update", ({ params }) => {
    updates.push(params.update);
    mapped.push(mapper.map(params as any));
  })
  .onRequest("session/request_permission", ({ params }) => ({
    outcome: { outcome: "selected", optionId: params.options[0].optionId },
  }))
  .onRequest("elicitation/create", async ({ params }) => {
    if ((params as any).mode === "url") {
      while (!completeSeen) await new Promise((r) => setTimeout(r, 100));
      return { action: "accept" };
    }
    return { action: "accept", content: { environment: "staging", replicas: 2 } };
  })
  .onNotification("elicitation/complete", () => {
    completeSeen = true;
  })
  .onRequest("*", ({ method }) => {
    throw new Error("unexpected " + method);
  });
const conn = app.connect(ndJsonStream(Writable.toWeb(child.stdin) as any, Readable.toWeb(child.stdout) as any));
const a = conn.agent;
const check = (n: string, ok: boolean, x = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${n} ${x}`);
  if (!ok) process.exitCode = 1;
};
const kinds = () => updates.map((u) => u.sessionUpdate);
const prompt = async (sid: string, text: string) => {
  updates.length = 0;
  mapped.length = 0;
  return a.request("session/prompt", { sessionId: sid, prompt: [{ type: "text", text }] });
};
try {
  const init: any = await a.request("initialize", {
    protocolVersion: PROTOCOL_VERSION,
    clientCapabilities: { elicitation: { form: {}, url: {} } } as any,
  });
  check(
    "initialize advertises title + lifecycle",
    !!init.agentCapabilities.sessionCapabilities.title && !!init.agentCapabilities.sessionCapabilities.fork,
    JSON.stringify(init.agentCapabilities.sessionCapabilities),
  );
  const s: any = await a.request("session/new", { cwd: "C:/tmp", mcpServers: [] });
  check("session/new returns config options", s.configOptions.length === 2);
  await new Promise((r) => setTimeout(r, 100));
  check(
    "available commands sent",
    updates.some((u) => u.sessionUpdate === "available_commands_update"),
  );
  const sid = s.sessionId;
  const cfg: any = await a.request("session/set_config_option", {
    sessionId: sid,
    configId: "model",
    value: "smart",
  } as any);
  check("set_config_option", cfg.configOptions[0].currentValue === "smart");
  const t0 = Date.now();
  await a.request("session/set_title", { sessionId: sid, title: "Renamed" });
  check("set_title is slow (as designed)", Date.now() - t0 >= 1400, `${Date.now() - t0}ms`);
  let r: any = await prompt(sid, "hello there");
  check(
    "plain prompt streams + title + usage",
    r.stopReason === "end_turn" &&
      kinds().includes("agent_message_chunk") &&
      kinds().includes("session_info_update") &&
      kinds().includes("usage_update"),
  );
  r = await prompt(sid, "/help");
  check("/help", r.stopReason === "end_turn" && updates.some((u) => u.content?.text?.includes("subagent")));
  r = await prompt(sid, "/tool");
  check(
    "/tool diff",
    updates.some((u) => u.content?.[0]?.type === "diff") &&
      mapped.some((m) => m.events.some((e: any) => e.type === "tool_call_end")),
  );
  r = await prompt(sid, "/permission");
  check(
    "/permission",
    updates.some((u) => u.content?.text?.includes("allow-once")),
  );
  r = await prompt(sid, "/elicit");
  check(
    "/elicit form",
    updates.some((u) => u.content?.text?.includes("staging")),
  );
  r = await prompt(sid, "/elicit-url");
  check("/elicit-url + complete", completeSeen && updates.some((u) => u.content?.text?.includes("accept")));
  r = await prompt(sid, "/plan");
  check("/plan", kinds().filter((k) => k === "plan").length === 4);
  r = await prompt(sid, "/subagent");
  const subEvents = mapped.flatMap((m) => m.events);
  const starts = subEvents
    .filter((e: any) => e.type === "tool_call_start")
    .map((e: any) => e.tool_call_name ?? e.toolCallName ?? e.name ?? JSON.stringify(e).slice(0, 60));
  const chunks = subEvents.filter((e: any) => e.type === "tool_call_chunk");
  check(
    "/subagent: 2 children, chunks attributed",
    starts.length === 2 && chunks.length >= 8,
    `starts=${JSON.stringify(starts)} chunks=${chunks.length}`,
  );
  r = await prompt(sid, "/compact");
  check("/compact", kinds().includes("compaction_summary_chunk"));
  r = await prompt(sid, "/notice");
  check("/notice", kinds().filter((k) => k === "notice").length === 3);
  r = await prompt(sid, "/cursor");
  check("/cursor", kinds().includes("cursor_update"));
  r = await prompt(sid, "/suggest");
  check("/suggest", kinds().includes("prompt_suggestions_update"));
  r = await prompt(sid, "/title");
  check("/title", kinds().includes("session_info_update"));
  let failed = "";
  try {
    await prompt(sid, "/fail");
  } catch (e) {
    failed = String(e);
  }
  check("/fail errors", failed.includes("failed on purpose") || failed !== "", failed.slice(0, 80));
  const slow = prompt(sid, "/slow");
  setTimeout(() => void a.notify("session/cancel", { sessionId: sid }), 2200);
  r = await slow;
  check("/slow + session/cancel", r.stopReason === "cancelled");
  const list: any = await a.request("session/list", {});
  check("session/list", list.sessions.length === 1 && list.sessions[0].title);
  const st: any = await a.request("session/status", { sessionId: sid } as any);
  check("session/status", typeof st.status === "string", st.status);
  const fork: any = await a.request("session/fork", { sessionId: sid, cwd: "C:/tmp", mcpServers: [] } as any);
  check("session/fork", fork.sessionId && fork.sessionId !== sid && fork.configOptions[0].currentValue === "smart");
  await a.request("session/archive", { sessionId: fork.sessionId } as any);
  await a.request("session/close", { sessionId: sid } as any);
  await a.request("session/delete", { sessionId: fork.sessionId } as any);
  check("archive/close/delete", true);
  check("no unhandled methods", !agentLog.join("").includes("UNHANDLED"));
} catch (e) {
  console.log("FAIL unexpected", e);
  process.exitCode = 1;
  console.log(agentLog.join("").slice(-1500));
} finally {
  console.log(process.exitCode ? "\nSome checks FAILED" : "\nAll checks passed");
  conn.close();
  child.kill();
  setTimeout(() => process.exit(), 200);
}
