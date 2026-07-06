---
name: argos-release
description: Prepare and publish Argos releases in this repository. Use when Codex needs to bump the app version, update CHANGELOG.md, keep release notes in English, run release checks, create or update versioned release branches such as release/v0.1.0, continue a half-finished release, merge to master with the documented release flow, create or push version tags, or clean up release branches after publishing.
---

# Argos Release

## Overview

Follow the repository-specific Argos release process. Prepare release metadata on `master`, keep `CHANGELOG.md` concise, and publish through the documented flow.

## Start With Repo State

Inspect git state before changing anything:

- Check the current branch and working tree.
- Check whether `release/<version>` exists locally or on `origin`.
- Check whether `v<version>` exists locally or on `origin`.

If a local or remote tag already exists on the wrong commit, stop and ask before replacing it.

## Choose The Release Mode

Pick the mode that matches the user's request and current git state:

1. `prepare metadata`
   Update `package.json`, `CHANGELOG.md`, and the release notes commit on `master`.
2. `cut release branch`
   Create `release/<version>` from the release-ready commit on `master` and push it.
3. `update existing release branch`
   Use this when the release branch already exists but metadata changed afterward. Commit on `master`, move `release/<version>` to the new `master` commit, and force-push only the disposable release branch.
4. `publish`
   Use this only after the release PR is approved. Merge or fast-forward `master`, create the version tag on the same commit, push the tag, and then delete the temporary release branch.

Use [references/release-checklist.md](references/release-checklist.md) for exact commands.

## Update Release Metadata

When preparing a release on `master`:

- Update `package.json` to the target version.
- Add a new `CHANGELOG.md` section at the top.
- Summarize only user-visible or release-relevant changes since the previous tag.
- Prefer deriving the notes from recent commits or the diff since the previous release tag.
- Do not create SDD folders for pure release metadata, branch, tag, or release PR work.

Format changelog entries like this:

```md
## vX.Y.Z (YYYY-MM-DD)
- English bullet
- English bullet
```

Use the current local date in `YYYY-MM-DD` form. Preserve older changelog sections unless the user explicitly asks to rewrite them.

## Run Release Checks

After editing release metadata, run these repo-required commands:

- `pnpm run format`
- `pnpm run i18n`
- `pnpm run lint`

Prefer running `pnpm run typecheck` before cutting the release branch. Run tests when the user asks, when the release touches behavior beyond metadata, or when risk is unclear. Report pre-existing failures separately from the release metadata work.

## Follow Release Branch Policy

- Keep `master` as the integration branch.
- Treat `release/<version>` as disposable and identical to a commit already on `master`.
- Never click "Update branch" on the release PR.
- After approval, merge the PR to `master` and create the version tag.

Read [../../../docs/release-flow.md](../../../docs/release-flow.md) when you need the full repository policy or if the checklist and repo docs ever diverge.

## Common Recovery Case

When the user says something like "the release branch already exists but the tag is not created yet" or "I fixed the changelog after cutting the release branch":

1. Commit the metadata fix on `master`.
2. Push `master`.
3. Move `release/<version>` to `HEAD`.
4. Force-push `release/<version>` with `--force-with-lease`.
5. Continue with the existing or updated PR to `master`.
6. After approval, merge and create the tag.

## Response Rules

- Act on the repo when the user wants the release advanced; do not stop at generic advice.
- Tell the user exactly which step of the release flow they are currently in.
- Use concrete versions and dates such as `v0.1.0` and `2026-06-24`.
- Keep commands copy-pastable and repo-specific.
- If checks fail, separate blocking failures from unrelated existing warnings.

## Examples

Activate this skill for requests like:

- "Prepare release 0.1.0, update the version number and changelog"
- "Continue releasing 0.1.1, the release branch already exists but no tag yet"
- "Publish release/v0.1.2 following the project flow"
- "Check what's still missing before releasing v0.1.3"
