/**
 * Read-only shell command classification for plan mode and permission prompts.
 *
 * The POSIX classifier is ported from Pine (src/actions.ts, `readOnlyCommand`),
 * MIT License, Copyright (c) 2026 Paul Henschel — https://github.com/pmndre/pine
 *
 * Deliberately narrow: anything that could write (a redirect, a substitution, an
 * option that runs or deletes) is not read-only. A wrong "no" costs a prompt (or
 * a refusal in plan mode); a wrong "yes" would let an action through unseen.
 */

/** Pi built-in tools that only read the workspace. */
export const READ_ONLY_BUILTIN_TOOLS: ReadonlySet<string> = new Set(["read", "grep", "find", "ls"]);

/** Built-ins available in plan mode: the read tools plus shells gated per command. */
export const PLAN_MODE_BUILTIN_TOOLS = ["read", "grep", "find", "ls", "bash"] as const;

/** Commands that only look, as far as their name says. */
const READ_ONLY = new Set([
  "ls",
  "cat",
  "head",
  "tail",
  "wc",
  "pwd",
  "echo",
  "printf",
  "date",
  "whoami",
  "id",
  "uname",
  "hostname",
  "which",
  "type",
  "file",
  "stat",
  "du",
  "df",
  "ps",
  "lsof",
  "env",
  "printenv",
  "grep",
  "rg",
  "find",
  "fd",
  "tree",
  "sort",
  "uniq",
  "cut",
  "tr",
  "diff",
  "cmp",
  "basename",
  "dirname",
  "realpath",
  "true",
  "test",
  "sleep",
  "jq",
  "nproc",
  "uptime",
]);

const READ_ONLY_GIT = new Set([
  "status",
  "diff",
  "log",
  "show",
  "blame",
  "ls-files",
  "rev-parse",
  "describe",
  "shortlog",
  "remote",
  "branch",
  "tag",
  "stash list",
]);

/** Whether a POSIX shell command line only looks. */
export function readOnlyCommand(command: string): boolean {
  const text = command.trim();
  if (!text || /[<>`]|\$\(|\$\{|\n/.test(text)) return false;
  for (const part of text.split(/\s*(?:&&|\|\||;|\|)\s*/)) {
    const words = part.trim().split(/\s+/);
    const name = words[0]?.split("/").pop() ?? "";
    if (!name) return false;
    if (name === "git") {
      const sub = words.slice(1).find((w) => !w.startsWith("-")) ?? "";
      if (!READ_ONLY_GIT.has(sub)) return false;
      // "git branch -D x", "git remote add", "git tag -d": the same word, another thing.
      if (/\s(-[dDmM]\b|--delete\b|--force\b|add\b|remove\b|rm\b|set-url\b|rename\b)/.test(part)) return false;
      continue;
    }
    if (!READ_ONLY.has(name)) return false;
    if (name === "find" && /\s-(delete|exec|execdir|ok|fprint)/.test(part)) return false;
    if ((name === "sort" || name === "tree" || name === "uniq") && /\s-o\b|\s--output/.test(part)) return false;
    if (name === "env" && words.length > 1) return false;
  }
  return true;
}

/** PowerShell cmdlets (and their common aliases) that only read. Argos addition. */
const READ_ONLY_POWERSHELL = new Set([
  "get-childitem",
  "gci",
  "dir",
  "ls",
  "get-content",
  "gc",
  "cat",
  "type",
  "select-string",
  "sls",
  "get-item",
  "gi",
  "get-itemproperty",
  "gp",
  "get-location",
  "gl",
  "pwd",
  "test-path",
  "resolve-path",
  "rvpa",
  "split-path",
  "join-path",
  "get-command",
  "gcm",
  "where.exe",
  "get-filehash",
  "get-date",
  "get-process",
  "gps",
  "measure-object",
  "measure",
  "select-object",
  "select",
  "where-object",
  "where",
  "sort-object",
  "sort",
  "format-table",
  "ft",
  "format-list",
  "fl",
  "out-string",
  "convertto-json",
  "convertfrom-json",
  "write-output",
  "echo",
]);

/**
 * Whether a PowerShell command line only reads. Same stance as the POSIX
 * classifier: redirects, subexpressions, script blocks with side effects,
 * call operators and anything outside the allowlist are not read-only.
 */
export function readOnlyPowerShellCommand(command: string): boolean {
  const text = command.trim();
  // > / >> redirects, $(...) subexpressions, & call operator, backtick escapes,
  // dot-sourcing, newlines, and -Command/-EncodedCommand style nesting.
  if (!text || /[<>`&]|\$\(|\n|(^|\s)\.\s/.test(text)) return false;
  for (const part of text.split(/\s*(?:\|\||;|\|)\s*/)) {
    const words = part.trim().split(/\s+/);
    const name = (words[0] ?? "").toLowerCase();
    if (!name) return false;
    if (name === "git") {
      if (!readOnlyCommand(part)) return false;
      continue;
    }
    if (!READ_ONLY_POWERSHELL.has(name)) return false;
    // Where-Object/Select-Object/Sort-Object take script blocks; only allow
    // ones that do not invoke anything ({ $_.Name -like '*.ts' }).
    if (/\{[^}]*\b(invoke|start|remove|set|new|add|clear|copy|move|rename|out-file|stop)-/i.test(part)) return false;
    if (/\s-(outfile|out-file)\b/i.test(part)) return false;
  }
  return true;
}

/** Whether a tool call only looks, given its tool name and input. */
export function isReadOnlyToolCall(toolName: string, input: unknown): boolean {
  if (READ_ONLY_BUILTIN_TOOLS.has(toolName)) return true;
  const command =
    input && typeof input === "object" && typeof (input as { command?: unknown }).command === "string"
      ? (input as { command: string }).command
      : undefined;
  if (command === undefined) return false;
  if (toolName === "bash") return readOnlyCommand(command);
  if (toolName === "powershell") return readOnlyPowerShellCommand(command);
  return false;
}

/** Fixed refusal for plan mode, after Pine's wording: do not ask, do not work around it. */
export const PLAN_REFUSAL =
  "Not done: you are in plan mode. In plan mode you look, read and search, and nothing is changed, run or sent. " +
  "Shell commands are allowed only when they just read (ls, cat, grep, find, git status/diff/log, ...): no redirects, " +
  "no $(...), no commands that write or execute. Do not try another way to do it. When you have seen enough, call " +
  "submit_plan with what you would do, in which order, in which files, and what could go wrong.";

/** System-prompt note for a session in plan mode. */
export const PLAN_MODE_PROMPT =
  "Mode: plan. The user wants a plan first, not the work. Look, read and search as much as you need: none of that " +
  "changes anything. Read-only shell commands (ls, cat, grep, find, git status/diff/log, ...) are allowed. Do not " +
  "write or edit files, run commands that change something, or send anything; such a call is refused. When you have " +
  "seen enough, call submit_plan with the objective, ordered steps, files likely to change, risks, and how the " +
  "result will be verified. The user reviews the plan and switches the mode when it is to be carried out.";

/**
 * Appended whenever write/edit are available. pi's own rules say the same, but
 * they are dropped when an agent has its own system prompt, and models that
 * planned with only a shell tend to keep writing files through it.
 */
export const FILE_TOOLS_GUIDANCE =
  "Change files with the file tools: edit for targeted changes (batch changes to one file in one call), write for " +
  "new files or complete rewrites. Do not create or patch files through the shell (heredocs, echo/printf " +
  "redirects, sed -i, python or node scripts): those bypass the file tools, are hard to review, and break on long " +
  "content. Use the shell to build, test and run commands.";

/** Note prefixed to the first prompt after the user leaves plan mode. */
export const PLAN_MODE_OVER_NOTE =
  "[Plan mode is over: the user has switched it off. Carry out what was planned and agreed in this conversation now.]";

// ---------------------------------------------------------------------------
// Critical actions (Auto mode asks only for these). Ported from Pine
// (src/actions.ts: PROTECTED_*, isProtectedPath, criticalCommand), MIT License,
// Copyright (c) 2026 Paul Henschel. Patterns are a net, not a wall: what they
// catch is put to the user.
// ---------------------------------------------------------------------------

/** Home-relative files and folders that make other programs run or hold account keys. */
const PROTECTED_HOME = [
  ".zshrc",
  ".zshenv",
  ".zprofile",
  ".zlogin",
  ".bashrc",
  ".bash_profile",
  ".bash_login",
  ".profile",
  ".envrc",
  ".config/fish",
  ".ssh",
  ".gnupg",
  ".aws",
  ".azure",
  ".kube",
  ".config/gcloud",
  ".docker/config.json",
  ".netrc",
  ".npmrc",
  ".yarnrc",
  ".yarnrc.yml",
  ".pypirc",
  ".gitconfig",
  ".config/git",
  "Library/LaunchAgents",
  ".config/systemd",
  ".config/autostart",
  "Documents/PowerShell",
  "Documents/WindowsPowerShell",
  "AppData/Roaming/Microsoft/Windows/Start Menu/Programs/Startup",
];
/** A repository's hooks and configuration run programs for whoever uses git there. */
const PROTECTED_ANYWHERE = /(^|\/)\.git\/(hooks(\/|$)|config$)|(^|\/)\.husky(\/|$)/;
/** The same names as they appear in a command line. */
const PROTECTED_IN_COMMAND =
  /(^|[\s"'=/~])(\.(zshrc|zshenv|zprofile|bashrc|bash_profile|profile|netrc|npmrc|pypirc|gitconfig)\b|\.ssh\/|\.gnupg\/|\.aws\/|\.kube\/|LaunchAgents\/|\.git\/hooks\/|\.git\/config\b|authorized_keys\b)/;

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/\/+$/, "");
}

function isInside(parent: string, child: string): boolean {
  const p = normalizePath(parent).toLowerCase();
  const c = normalizePath(child).toLowerCase();
  return c === p || c.startsWith(`${p}/`);
}

/** Resolves a tool path against the workspace (absolute paths and ~ kept). */
export function resolveToolPath(target: string, cwd: string, home: string): string {
  const t = normalizePath(target.trim());
  if (t === "~" || t.startsWith("~/")) return normalizePath(`${home}${t.slice(1)}`);
  if (/^[A-Za-z]:\//.test(t) || t.startsWith("/")) return t;
  const parts = `${normalizePath(cwd)}/${t}`.split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "..") out.pop();
    else if (part !== "." && part !== "") out.push(part);
  }
  const prefix = normalizePath(cwd).startsWith("/") ? "/" : "";
  return prefix + out.join("/");
}

/** Whether a file is one of the protected ones. */
export function isProtectedPath(resolved: string, home: string): boolean {
  if (PROTECTED_ANYWHERE.test(normalizePath(resolved))) return true;
  return PROTECTED_HOME.some((rel) => isInside(`${normalizePath(home)}/${rel}`, resolved));
}

/** Why a command line is critical, or undefined (POSIX and PowerShell). */
export function criticalCommand(command: string): string | undefined {
  const c = command;
  if (
    /\b(curl|wget|fetch)\b[^|;&\n]*\|\s*(sudo\s+)?(ba|z|da|k)?sh\b|\b(curl|wget)\b[^|;&\n]*\|\s*(sudo\s+)?(python\d?|node|perl|ruby)\b/.test(
      c,
    ) ||
    /\b(iwr|irm|invoke-webrequest|invoke-restmethod)\b[^;\n]*\|\s*(iex|invoke-expression)\b/i.test(c)
  )
    return "downloads a program and runs it in one step";
  if (
    /\brm\s+(-[a-zA-Z]*\s+)*-[a-zA-Z]*[rR][a-zA-Z]*\s+(-[a-zA-Z]*\s+)*["']?(\/|~|\$HOME|\/Users\/[^/\s"']+|\/home\/[^/\s"']+|[A-Za-z]:[\\/]?|[A-Za-z]:[\\/]Users[\\/][^\\/\s"']+|\/[a-z]\/Users\/[^/\s"']+|\/[a-z])[\\/]?["']?(\s|$)/i.test(
      c,
    ) ||
    /\b(remove-item|rm|del|rmdir|rd)\b[^;\n]*-recurse[^;\n]*["']?([A-Za-z]:[\\/]?|~|\$HOME|\$env:USERPROFILE|[A-Za-z]:[\\/]Users[\\/][^\\/\s"']+)[\\/]?["']?(\s|$)/i.test(
      c,
    )
  )
    return "deletes a home folder or the whole disk";
  if (/\bgit\s+push\b[^\n;&|]*(\s--force\b|\s-f\b|\s--force-with-lease\b|\s\+\S)/.test(c))
    return "rewrites what was pushed (force push)";
  if (/\bgit\s+(reset\s+--hard|clean\s+-[a-zA-Z]*f|checkout\s+--\s+\.|restore\s+\.)/.test(c))
    return "throws away changes that were not committed";
  if (/\bsudo\b/.test(c) || /\bstart-process\b[^;\n]*-verb\s+runas\b/i.test(c)) return "runs with administrator rights";
  if (!readOnlyCommand(c) && PROTECTED_IN_COMMAND.test(c))
    return "touches a file that makes other programs run or holds the keys to the account";
  if (/\b(chmod|chown)\s+-[a-zA-Z]*R[a-zA-Z]*\s+\S+\s+(\/|~|\$HOME)\/?(\s|$)/.test(c))
    return "changes the permissions of a whole home folder or disk";
  if (
    /\blaunchctl\s+(load|bootstrap|submit)\b|\bsystemctl\s+(--user\s+)?enable\b|\bcrontab\s+(?!-l\b)\S/.test(c) ||
    /\b(register-scheduledtask|new-service|schtasks\s+\/create)\b/i.test(c)
  )
    return "installs something that keeps running or starts by itself";
  return undefined;
}

// ---------------------------------------------------------------------------
// Per-call decision for the Pi worker's tool_call hook.
// ---------------------------------------------------------------------------

export type ToolCallPolicy = {
  planMode: boolean;
  restricted: boolean;
  permissionMode: "default" | "full_access";
  /** Manual: ask before every call that changes something. Otherwise Auto. */
  manualApproval: boolean;
  cwd: string;
  home: string;
};

export type ToolCallDecision =
  | { action: "allow" }
  | { action: "block"; reason: string }
  | { action: "ask"; reason?: string };

const FILE_WRITE_TOOLS = new Set(["write", "edit"]);
/** Argos tools that only look or only record a plan. */
const ARGOS_LOOK_TOOLS = new Set(["manual_search", "submit_plan"]);

/**
 * Pine's modes: Plan refuses anything that is not a look; Manual asks for every
 * change; Auto asks only for critical actions and writes outside the project;
 * Bypass never asks. Restricted (outside-triggered) runs only read.
 */
export function decideToolCall(policy: ToolCallPolicy, toolName: string, input: unknown): ToolCallDecision {
  if (policy.restricted) {
    return READ_ONLY_BUILTIN_TOOLS.has(toolName)
      ? { action: "allow" }
      : { action: "block", reason: "This run is restricted to read-only tools." };
  }
  if (isReadOnlyToolCall(toolName, input)) return { action: "allow" };
  if (policy.planMode) {
    return ARGOS_LOOK_TOOLS.has(toolName) ? { action: "allow" } : { action: "block", reason: PLAN_REFUSAL };
  }
  if (policy.permissionMode === "full_access") return { action: "allow" };
  if (toolName === "manual_search") return { action: "allow" };
  if (policy.manualApproval) return { action: "ask" };

  // Auto: only what is critical, or outside the project, is put to the user.
  const record = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  if (toolName === "bash" || toolName === "powershell") {
    const command = typeof record.command === "string" ? record.command : "";
    const why = criticalCommand(command);
    return why ? { action: "ask", reason: why } : { action: "allow" };
  }
  if (FILE_WRITE_TOOLS.has(toolName)) {
    const target = typeof record.path === "string" ? record.path : "";
    if (!target) return { action: "ask" };
    const resolved = resolveToolPath(target, policy.cwd, policy.home);
    if (isProtectedPath(resolved, policy.home)) {
      return { action: "ask", reason: "writes a file that makes other programs run or holds the keys to the account" };
    }
    if (!isInside(policy.cwd, resolved)) return { action: "ask", reason: "writes outside the project folder" };
    return { action: "allow" };
  }
  // MCP and other tools act beyond the workspace; Auto lets them run like Pine's
  // auto does for local tools. Add per-tool rules here if one should ask.
  return { action: "allow" };
}
