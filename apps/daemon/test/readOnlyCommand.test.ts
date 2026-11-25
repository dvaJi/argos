import { describe, expect, it } from "bun:test";
import { isReadOnlyToolCall, readOnlyCommand, readOnlyPowerShellCommand } from "../src/host/readOnlyCommand";

describe("readOnlyCommand (POSIX)", () => {
  it.each([
    "ls -la",
    "find src -name '*.ts'",
    "cat package.json | jq .scripts",
    "git status && git diff --stat",
    "git log --oneline -5",
    "rg -n health src",
    "grep -rn TODO . | sort | uniq",
  ])("allows %s", (command) => expect(readOnlyCommand(command)).toBe(true));

  it.each([
    "echo hi > file.txt",
    "cat a >> b",
    "ls $(pwd)",
    "ls `pwd`",
    "rm -rf build",
    "find . -name '*.tmp' -delete",
    "find . -exec rm {} \;",
    "git branch -D main",
    "git remote add origin x",
    "git commit -m x",
    "git checkout main",
    "sort -o out.txt in.txt",
    "env FOO=1 node x.js",
    "ls && npm install",
    "bun run build",
  ])("refuses %s", (command) => expect(readOnlyCommand(command)).toBe(false));
});

describe("readOnlyPowerShellCommand", () => {
  it.each([
    "Get-ChildItem -Recurse -Filter *.ts",
    "Get-Content package.json | ConvertFrom-Json",
    "Select-String -Path src\*.ts -Pattern health",
    "Get-ChildItem | Where-Object { $_.Length -gt 1000 } | Select-Object Name",
    "git status",
  ])("allows %s", (command) => expect(readOnlyPowerShellCommand(command)).toBe(true));

  it.each([
    "Remove-Item build -Recurse",
    "Set-Content a.txt hi",
    "Get-Content a > b",
    "Get-ChildItem | ForEach-Object { Remove-Item $_ }",
    "Get-ChildItem | Where-Object { Remove-Item $_ }",
    "& ./script.ps1",
    ". ./profile.ps1",
    "Write-Output $(Remove-Item x)",
    "git push",
  ])("refuses %s", (command) => expect(readOnlyPowerShellCommand(command)).toBe(false));
});

describe("isReadOnlyToolCall", () => {
  it("treats read built-ins as read-only and gates shells by command", () => {
    expect(isReadOnlyToolCall("read", { path: "a" })).toBe(true);
    expect(isReadOnlyToolCall("bash", { command: "ls" })).toBe(true);
    expect(isReadOnlyToolCall("bash", { command: "rm a" })).toBe(false);
    expect(isReadOnlyToolCall("powershell", { command: "Get-ChildItem" })).toBe(true);
    expect(isReadOnlyToolCall("edit", { path: "a" })).toBe(false);
    expect(isReadOnlyToolCall("write", { path: "a", content: "" })).toBe(false);
  });
});
