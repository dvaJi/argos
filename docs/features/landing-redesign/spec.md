# Feature: Landing page redesign (agent-first composition)

## Summary

Rewrite `apps/landing` (`@argos/landing`, the marketing site served as
argos.aipurrjects.xyz) into a top-notch developer-focused landing. The
composition takes inspiration from vgpu.sh: clean Vercel-style docs aesthetic,
terminal commands as first-class content, and an explicit agent-first story
that matches the README positioning ("The open-source control plane for AI
coding agents").

Brand and IA are preserved: dark ink theme, cyan accent (#22d3ee), Geist +
JetBrains Mono, the Argos icon, and the existing anchors (`#features`,
`#providers`, `#agents` is new, `#download`) plus `/docs`.

## User stories

- As a developer evaluating Argos, I immediately understand it is a control
  plane for agents/models/tools, and I can copy the install command without
  hunting.
- As an agent-driven user, I see how ACP agents, MCP servers, and Skills plug
  in, with the exact settings paths to enable them.
- As a self-hoster, I find the daemon install commands (shell, PowerShell,
  Homebrew) with copy buttons.

## Acceptance criteria

- Hero fits the first viewport: headline <= 2 lines, subtext <= 20 words,
  primary (Download) and secondary (copyable brew command) CTAs visible without
  scroll, real product screenshot (`/shot-dark.png`).
- New `#agents` section documents the three real integration surfaces
  (ACP agents, MCP tools, Skills) with accurate `Settings -> ...` paths and
  real daemon API endpoints (`POST /api/v1/route`, `/api/v1/events`).
- Features bento keeps exactly 6 cells and gives at least 2 cells real visual
  content (provider SVG icons, mono search chips), not text-only cards.
- Download section shows desktop platforms plus daemon install commands
  (shell / PowerShell / Homebrew) with working copy buttons.
- All copy passes the em-dash ban (no `—` or `–` as separators), uses only
  verified commands (`brew install --cask argos`,
  `brew install dvaJi/tap/argos-daemon`, the `distro/install` scripts,
  `argos-daemon --web --pair`).
- Hero background is a WebGPU shader ("Panoptes") rendered by `ShaderBackdrop`
  via `vgpu@0.3.1`, with graceful fallback to the static CSS mesh-gradient
  when WebGPU is unsupported, `prefers-reduced-motion` is active, or `init()`
  fails. Shader pauses via IntersectionObserver when hero leaves the viewport.
- `bun run --filter @argos/landing typecheck` and `build` pass;
  `bun run format` + `bun run lint` clean.

## Non-goals

- No new routes, no docs page changes, no worker/OAuth relay changes.
- No light mode (site stays dark-only, matching current brand).
- No invented CLI surface: skills/MCP/ACP are configured in-app, so the page
  references settings paths instead of fake CLI commands.
