---
name: argos-sdd
description: Use for any Argos code, configuration, documentation, feature, issue fix, refactor, or architecture change before implementation. This skill enforces the project SDD workflow: classify the goal, create or update spec.md, plan.md, and tasks.md under docs/features, docs/issues, or docs/architecture, resolve NEEDS CLARIFICATION items, then implement and validate.
---

# Argos SDD

## When To Use

Use this skill before changing Argos source code, configuration, tests, docs, build scripts, release workflows, or project structure.

## Classify The Goal

Create one kebab-case folder per goal:

- New capability, user-visible behavior, integration, or tool: `docs/features/<goal>/`
- Bug, regression, failing test, CI failure, reliability problem, or prompt/runtime issue: `docs/issues/<goal>/`
- Refactor, migration, dependency boundary, shared contract, runtime architecture, or cross-module design: `docs/architecture/<goal>/`

If one request contains multiple independent goals, split them into separate folders. Keep current architecture reference docs such as `docs/architecture/agent-system.md` in place; use subfolders for new architecture targets.

## Required Artifacts

Every active goal folder must contain:

- `spec.md`: user need, goal, acceptance criteria, constraints, non-goals, open questions
- `plan.md`: implementation approach, affected interfaces, data flow, compatibility, test strategy
- `tasks.md`: ordered tasks that can map to commits or review slices

Resolve every `[NEEDS CLARIFICATION]` marker before implementation. If a requested change is tiny, keep the files short and concrete.

## Workflow

1. Inspect the current code and docs first.
2. Pick the target folder from the classification rules.
3. Create or update `spec.md`, `plan.md`, and `tasks.md`.
4. Keep the implementation aligned with existing Argos patterns:
   - main process Presenter boundaries
   - typed `shared/contracts/*`
   - renderer `api/*Client`
   - the current renderer's component and state patterns
5. Implement the change after the SDD artifacts are complete.
6. Update `tasks.md` as work lands.
7. Run `pnpm run format` and `pnpm run lint` before handoff. Add `pnpm run typecheck`
   when the change touches TypeScript surfaces.

## Documentation Hygiene

- Move completed or stale SDD target folders to `docs/archives/<goal>/`.
- Add an archive note when a document references historical code paths.
- Delete documents that only describe removed code and have no reusable decision record.
- Update `docs/README.md` when a moved document remains part of the navigation surface.
