# Update argos-release Skill for Fork

## Goal

Adapt the release skill to this fork's conventions: English-only changelogs and semantic versioning starting from 0.1.0.

## Changes

1. **Remove Chinese from changelog format** — English-only bullet points.
2. **Update version examples** — Replace `v1.0.x` references with `v0.1.x` throughout.
3. **Update SKILL.md frontmatter description** — Remove "bilingual" reference.
4. **Update release-checklist.md** — Same version and language fixes.
5. **Update docs/release-flow.md** — Update example version strings.

## Acceptance Criteria

- All skill files reference `v0.1.x` as the version pattern.
- No Chinese text in changelog format examples.
- Documentation is internally consistent.
