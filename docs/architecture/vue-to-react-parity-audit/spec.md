# Vue-to-React Parity Audit

## Goal

Compare the migrated React renderer/settings surface in `argos3` against the original DeepChat Vue implementation and document confirmed user-facing parity gaps.

## Acceptance Criteria

- Audit covers the main renderer route surface and the settings renderer route surface.
- Confirmed missing or materially incomplete features are backed by file references in both repos.
- Areas already at parity are called out separately from uncertain runtime-only items.

## Constraints

- Audit only; no product behavior changes in this task.
- Prefer concrete code evidence over inferred feature gaps.

## Non-Goals

- Fixing the gaps identified by the audit.
- Full runtime QA of every migrated screen.
