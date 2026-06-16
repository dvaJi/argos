<p align='center'>
<img src='./build/icon.png' width="150" height="150" alt="Argos AI Assistant Icon" />
</p>

<h1 align="center">Argos - Powerful Open-Source AI Agent Platform</h1>

<p align="center">Argos is a feature-rich open-source AI agent platform that unifies models, tools, and agents: multi-LLM chat, MCP tool calling, Skills, ACP agent integration, and remote control.</p>

## Table of Contents

- [Project Introduction](#-project-introduction)
- [Main Features](#-main-features)
- [Skills Support](#-skills-support)
- [ACP Integration (Agent Client Protocol)](#-acp-integration-agent-client-protocol)
- [Remote Control](#-remote-control)
- [Supported Model Providers](#-supported-model-providers)
- [Quick Start](#-quick-start)
  - [Download and Install](#download-and-install)
  - [Configure Models](#configure-models)
  - [Start Conversations](#start-conversations)
- [Development Guide](#-development-guide)
- [Community & Contribution](#-community--contribution)
- [License](#-license)

## Project Introduction

Argos is a powerful open-source AI agent platform that brings together models, tools, and agent runtimes in one desktop app. Whether you're using cloud APIs like OpenAI, Gemini, Anthropic, or locally deployed Ollama models, Argos delivers a smooth user experience.

Beyond chat, Argos supports agentic workflows: rich tool calling via MCP (Model Context Protocol), installable Skills for specialized tasks, unique ACP (Agent Client Protocol) integration that lets you run ACP-compatible agents as first-class “models” with a dedicated workspace UI, and remote control from messaging apps.

<table align="center">
  <tr>
    <td align="center" style="padding: 10px;">
      <img src='https://github.com/user-attachments/assets/6e932a65-78e0-4d2e-9654-ccc010f78bf7' alt="Argos Light Mode" width="400"/>
      <br/>
    </td>
    <td align="center" style="padding: 10px;">
      <img src='https://github.com/user-attachments/assets/ea6ccf60-32af-4bc1-91cc-e72703bdc1ff' alt="Argos Dark Mode" width="400"/>
      <br/>
    </td>
  </tr>
</table>

## Main Features

- **Multiple Cloud LLM Providers**: DeepSeek, OpenAI, Moonshot/Kimi, Grok, Gemini, Anthropic, and more — plus any OpenAI-, Gemini-, or Anthropic-compatible API.
- **Local Model Deployment**: Integrated Ollama with download, deploy, and run controls — no command line needed.
- **Rich Chat Experience**: Markdown + [CodeMirror](https://codemirror.net/) rendering, multi-window/multi-tab parallelism, Artifacts, message retry and conversation forking, multi-modal (images, Mermaid, text-to-image), inline source highlighting.
- **Search Extensions**: Built-in BoSearch and Brave Search MCP integrations, plus any custom search engine via a search-assistant model.
- **MCP Support**: Full Resources/Prompts/Tools coverage, semantic workflows, inMemory services, StreamableHTTP/SSE/Stdio transports, visual debugging, and bundled Node.js / npx runtime.
- **Skills**: Install from folders, ZIPs, or URLs; enable per conversation; import/export with Claude Code, Codex, Cursor, Windsurf, GitHub Copilot, Kiro, Antigravity, OpenCode, Goose, Kilo Code, and more. Built-ins cover code review, document collaboration, Office/PDF, frontend design, MCP development, and others.
- **ACP Agent Integration**: Run ACP-compatible agents (built-in or custom commands) as selectable "models" with a native workspace UI.
- **Remote Control**: Drive Argos sessions from Telegram, Feishu/Lark, QQBot, Discord, and WeChat iLink.
- **Multi-Platform**: Windows, macOS, Linux with a themed light/dark UI, rich DeepLink support, encryption-ready data layer, and Apache 2.0 licensing for commercial use.

For more details, see the [documentation index](./docs/README.md).

## Skills Support

Argos Skills follow the standard Agent Skills specification: a Skill packages task instructions, reference files, assets, and optional scripts so Argos can act as a domain specialist once enabled.

Install from folders, ZIPs, or URLs, and import/export with Claude Code, Codex, Cursor, Windsurf, GitHub Copilot, Kiro, Antigravity, OpenCode, Goose, Kilo Code, and other compatible tools.

Built-in Skills cover generative art, code review, Argos settings, document collaboration, DOCX, frontend design, git commits, infographic syntax, MCP development, PDF, PPTX, Skill creation, Web Artifacts, and XLSX.

**Quick start:** **Settings → Skills** → install or import a Skill → enable it in conversations that need that capability.

## ACP Integration (Agent Client Protocol)

Argos has built-in support for [Agent Client Protocol (ACP)](https://agentclientprotocol.com), letting you integrate external agent runtimes with a native UI. Once enabled, ACP agents appear as first-class entries in the model selector.

**Quick start:** **Settings → ACP Agents** → enable ACP → enable a built-in agent or add a custom ACP-compatible command → select it in the model selector.

Browse the ecosystem: https://agentclientprotocol.com/overview/clients

## Remote Control

Drive Argos from messaging apps so a session can keep running when you're away from the desktop. Configure remote channels under **Settings → Remote**.

Supported channels: Telegram, Feishu/Lark, QQBot, Discord, and WeChat iLink. Remote endpoints can bind to a session, then create or switch sessions, stop generation, open the current session on desktop, answer pending questions or permission prompts, switch models, and check runtime status.

Common commands: `/start`, `/help`, `/pair`, `/new`, `/sessions`, `/use`, `/stop`, `/open`, `/pending`, `/model`, `/status`.

## Supported Model Providers

Argos ships with 40+ first-class providers including DeepSeek, OpenAI (and OpenAI Responses), Moonshot/Kimi, Grok, Gemini, Anthropic, Ollama, AWS Bedrock, Azure OpenAI, Vertex AI, GitHub Models, GitHub Copilot, xAI, Zhipu, Doubao, DashScope, Groq, OpenRouter, Together, LM Studio, 302.AI, ModelScope, SiliconFlow, PPIO, JieKou.AI, ZenMux, Vercel AI Gateway, and Xiaomi MiMo. Any OpenAI-, Gemini-, or Anthropic-compatible endpoint is also supported.

For a full list with icons, see the in-app **Settings → Model Providers**.

## Quick Start

### Download and Install

**Option 1: GitHub Releases** — Grab the latest build for your system from [GitHub Releases](https://github.com/dvaJi/argos/releases): Windows `.exe`, macOS `.dmg`, or Linux `.AppImage` / `.deb`.

**Option 2: Official Website** — Download from [argos.aipurrjects.com](https://argos.aipurrjects.com/#/download).

**Option 3: Homebrew (macOS)**

```bash
brew install --cask argos
```

### Configure Models

1. Launch Argos
2. Open **Settings → Model Providers**
3. Add your API keys or configure local Ollama

### Start Conversations

1. Click **+** to create a new conversation
2. Pick a model from the selector
3. Start chatting

For a comprehensive guide, see the [documentation index](./docs/README.md).

## Development Guide

Read the [Contribution Guidelines](./CONTRIBUTING.md) first. Windows and Linux builds are produced by GitHub Actions; for macOS signing and packaging see the [Mac Release Guide](https://github.com/dvaJi/argos/wiki/Mac-Release-Guide).

### Install Dependencies

```bash
pnpm install
pnpm run installRuntime
# if you hit `No module named 'distutils'`:
pip install setuptools
```

> **Windows:** Enable Developer Mode (or run as Administrator) so `pnpm` can create symlinks and hardlinks.

### Start Development

```bash
pnpm run dev
```

### Build

```bash
pnpm run build:win        # Windows (current arch)
pnpm run build:mac        # macOS   (current arch)
pnpm run build:linux      # Linux   (current arch)
# Or target a specific architecture:
pnpm run build:win:x64    pnpm run build:win:arm64
pnpm run build:mac:x64    pnpm run build:mac:arm64
pnpm run build:linux:x64  pnpm run build:linux:arm64
```

See the [Developer Guide](./docs/developer-guide.md) for project structure and architecture.

## Community & Contribution

- [Report issues](https://github.com/dvaJi/argos/issues)
- [Submit feature suggestions](https://github.com/dvaJi/argos/issues)
- [Submit code improvements](https://github.com/dvaJi/argos/pulls)
- [Help with translation](https://github.com/dvaJi/argos/tree/main/locales)

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full guide.

## Acknowledgements

Argos is based on [DeepChat](https://github.com/ThinkInAIXYZ/deep-chat) by ThinkInAIXYZ, originally licensed under the Apache License 2.0. This project includes modifications and additional work by the Argos maintainers. See `LICENSE` and `NOTICE` for attribution and license details.

## License

[Apache License 2.0](./LICENSE)
