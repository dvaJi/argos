# Skills Path Cross-Platform Repair

## Problem

Argos can fail during startup when the persisted `skillsPath` points to a default skills
directory from another OS or user profile, such as `/Users/old-user/.argos/skills` on Windows.
Windows resolves that POSIX-looking path under the current drive, then startup attempts to create a
directory like `C:\Users\old-user\.argos\skills` and can fail with `EPERM`.

## User Story

As a user who moved configuration between machines or OS accounts, I want Argos to recover from
stale default skills paths so the app still opens and uses the current profile's skills directory.

## Acceptance Criteria

- Startup repairs stale default skills paths from POSIX `/Users/<name>/.argos/skills`.
- Startup repairs stale default skills paths from Windows `C:\Users\<name>\.argos\skills`.
- Repair keeps any path suffix below `skills`.
- Non-default custom skills paths remain unchanged.
- Existing malformed `.argos` path repair keeps working.

## Non-Goals

- Do not migrate arbitrary custom directories.
- Do not change skill discovery, installation, or sync behavior.
- Do not add a new settings migration framework.

## Constraints

- Keep the change localized to the existing `SkillPresenter` startup path handling.
- Add focused unit coverage for the repaired path patterns.
