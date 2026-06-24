# Release Flow

This document defines the maintainer release flow for Argos without rewriting existing `dev` / `main` history.

## Goals

- Keep `dev` as the only long-lived integration branch.
- Keep `main` as a stable mirror of reviewed release commits.
- Keep releases tag-driven through [`.github/workflows/release.yml`](../.github/workflows/release.yml).
- Avoid creating new merge commits on `main`.

## Branch Roles

- `dev`: active development and integration branch.
- `main`: stable mirror of released source snapshots.
- `release/<version>`: short-lived review branch cut from an existing commit on `dev`.

`release/<version>` must not carry release-only commits. If a release fix is required, land it on `dev` first and then move the release branch forward to the updated `dev` commit.

## Standard Release Sequence

1. Prepare release metadata on `dev`.

   - Update the version, `CHANGELOG.md`, and any release notes on `dev`.
   - Run the required local checks before cutting a release branch.

2. Cut the review branch from the release-ready commit on `dev`.

   ```bash
   git switch dev
   git pull --ff-only origin dev
   git switch -c release/v0.1.0
   git push -u origin release/v0.1.0
   ```

3. Open a PR from `release/<version>` to `main`.

   - The PR exists for review and CI only.
   - Do not use the GitHub merge button to land the PR.
   - Do not click "Update branch" on the PR, because it creates new merge commits.

4. If review finds a release issue, fix it on `dev` first.

   ```bash
   git switch dev
   git pull --ff-only origin dev
   # land the release fix on dev
   git branch -f release/v0.1.0 origin/dev
   git switch release/v0.1.0
   git push --force-with-lease origin release/v0.1.0
   ```

   Use `--force-with-lease` only because the release branch is a disposable review branch that must stay identical to a commit already on `dev`.

5. After the PR is approved, fast-forward `main` locally on macOS or Linux.

   ```bash
   pnpm run release:ff -- release/v0.1.0 --tag v0.1.0
   ```

   The helper script validates:

   - the working tree is clean
   - the target release commit already exists on `origin/dev`
   - `origin/main` is an ancestor of the target commit
   - `main` can be updated with `git merge --ff-only`

   Windows maintainers should skip this helper and use the manual release sequence below.

6. Create and push the release tag on the same commit.

   ```bash
   git tag v0.1.0 release/v0.1.0
   git push origin v0.1.0
   ```

7. Delete the temporary release branch after the release is published.

   ```bash
   git push origin --delete release/v0.1.0
   git branch -d release/v0.1.0
   ```

## Manual Release Sequence

Use this sequence when the automatic helper is unavailable, especially on Windows. It updates `origin/main` directly from the reviewed release commit and does not depend on the state of your local `main`.

1. Fetch the latest release refs.

   ```bash
   git fetch origin main dev --prune
   ```

2. Resolve the reviewed release commit and record it as `TARGET_SHA`.

   ```bash
   git rev-parse origin/release/v0.1.0^{commit}
   # or
   git rev-parse release/v0.1.0^{commit}
   # or
   git rev-parse <target-ref>^{commit}
   ```

3. Confirm the release commit already exists on `origin/dev`.

   ```bash
   git merge-base --is-ancestor <TARGET_SHA> origin/dev
   ```

4. Confirm `origin/main` can be fast-forwarded to the reviewed release commit.

   ```bash
   git merge-base --is-ancestor origin/main <TARGET_SHA>
   ```

5. Confirm the release tag does not already exist locally or on `origin`.

   ```bash
   git rev-parse --verify --quiet refs/tags/v0.1.0
   git ls-remote --exit-code --tags origin refs/tags/v0.1.0
   ```

   Both commands should report that the tag is missing before you continue.

6. Fast-forward `origin/main` directly to the reviewed release commit.

   ```bash
   git push origin <TARGET_SHA>:refs/heads/main
   ```

7. Create and push the release tag on the same commit.

   ```bash
   git tag v0.1.0 <TARGET_SHA>
   git push origin refs/tags/v0.1.0
   ```

8. Delete the temporary release branch after the release is published.

   ```bash
   git push origin --delete release/v0.1.0
   git branch -d release/v0.1.0
   ```

## Repository Settings

These settings are not stored in the repository and must be configured manually on GitHub:

- Enable **Require linear history** on `main`.
- Keep PR checks required for PRs targeting `main` and `dev`.
- Allow maintainers to push `main` only through the documented `ff-only` procedure.
- Treat the PR merge button for `main` as disabled by policy, even if the repository UI still shows it.

## CI Guardrails

- PRs targeting `main` must come from `release/<version>` branches.
- The head commit of a PR targeting `main` must already be contained in `origin/dev`.
- Release tags must point to commits that are already reachable from `origin/main`.

These rules are enforced in the repository workflows so the documented flow and the automation stay aligned.

## History Hygiene

Use first-parent history for day-to-day inspection:

```bash
git log --oneline --decorate --first-parent dev -n 30
git log --oneline --decorate --first-parent main -n 30
```

Avoid using `git log --all --decorate --graph` as the default project view because old release merges and stale branch refs make it noisier than the actual mainline history.

Clean up short-lived branches after they are merged:

```bash
git fetch --prune origin
git branch --merged dev
```
