---
name: argos-settings
description: Argos app settings/preferences modification skill. Activate ONLY when the user explicitly asks to change Argos's own settings/preferences (e.g., theme, language, font size...). Do NOT activate for OS/system settings, editor settings, or other apps.
allowedTools:
  - argos_settings_toggle
  - argos_settings_set_language
  - argos_settings_set_theme
  - argos_settings_set_font_size
  - argos_settings_open
---

# Argos Settings Modification Skill

Use this skill to safely change Argos *application* settings during a conversation.

## Core rules

- Only change settings when the user is asking to change **Argos** settings.
- Use the dedicated settings tools; never attempt arbitrary key/value writes.
- These tools are intended to be available only when this skill is active.
- Viewing the main `argos-settings` `SKILL.md` activates this skill for the current conversation and exposes the `argos_settings_*` tools in the next tool loop iteration.
- Viewing linked files under this skill does **not** activate the skill.
- If the request is ambiguous, ask a clarifying question before applying.
- For unsupported or high-risk settings (MCP, prompts, providers, API keys, paths): do **not** apply changes; instead explain where to change it and open Settings.

## Supported settings (initial allowlist)

Toggles:

- `soundEnabled`: enable/disable sound effects.
- `copyWithCotEnabled`: enable/disable copying COT details.

Enums:

- `language`: Argos locale, including `system`, `zh-CN`, `en-US`, `zh-TW`, `zh-HK`, `ko-KR`, `ru-RU`, `ja-JP`, `fr-FR`, `fa-IR`, `pt-BR`, `da-DK`, `he-IL`.
- `theme`: `dark | light | system`.
- `fontSizeLevel`: integer level within supported range.

Settings navigation (open-only):

- Use `argos_settings_open` only when the request cannot be fulfilled by the settings tools, and avoid calling it if the change is already applied.
- `section` hints: `common`, `display`, `provider`, `mcp`, `prompt`, `acp`, `skills`, `knowledge-base`, `database`, `shortcut`, `about`.

## Workflow

1. Confirm the user is requesting a Argos settings change.
2. If the settings tools are not yet present, inspect the main `argos-settings` skill document first so the skill becomes active for this conversation.
3. Determine the target setting and the intended value.
4. If the setting is supported, call the matching tool:
   - toggles: `argos_settings_toggle`
   - language: `argos_settings_set_language`
   - theme: `argos_settings_set_theme`
   - font size: `argos_settings_set_font_size`
5. Confirm back to the user what changed (include the final value).
6. If the setting is unsupported, call `argos_settings_open` (with `section`) and provide a short pointer to the correct Settings section. Do not call it if the requested change has already been applied.

## Examples (activate this skill)

- "Change the theme to dark"
- "Turn off sound effects"
- "Change the language to English"
- "Don't include COT when copying"
- "Open the MCP settings page"
- "Edit my prompts"

## Examples (do NOT activate this skill)

- "Change the Windows system proxy to..."
- "Help me change the VS Code font"
- "Turn off the computer's sound"
