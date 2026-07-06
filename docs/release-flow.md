# Release Flow

This document defines the maintainer release flow for Argos.

## Goals

- Keep `master` as the only long-lived integration branch.
- Keep releases tag-driven through [`.github/workflows/release.yml`](../.github/workflows/release.yml).
- Avoid creating unnecessary merge commits on `master`.

## Branch Roles

- `master`: active development and integration branch.
- `release/<version>`: short-lived review branch cut from an existing commit on `master`.

`release/<version>` must not carry release-only commits. If a release fix is required, land it on `master` first and then move the release branch forward to the updated `master` commit.

## Standard Release Sequence

1. Prepare release metadata on `master`.

   - Update the version, `CHANGELOG.md`, and any release notes on `master`.
   - Run the required local checks before cutting a release branch.

2. Cut the review branch from the release-ready commit on `master`.

   ```bash
   git switch master
   git pull --ff-only origin master
   git switch -c release/v0.1.0
   git push -u origin release/v0.1.0
   ```

3. Open a PR from `release/<version>` to `master`.

   - The PR exists for review and CI only.
   - Do not click "Update branch" on the PR, because it creates new merge commits.

4. If review finds a release issue, fix it on `master` first.

   ```bash
   git switch master
   git pull --ff-only origin master
   # land the release fix on master
   git branch -f release/v0.1.0 origin/master
   git switch release/v0.1.0
   git push --force-with-lease origin release/v0.1.0
   ```

   Use `--force-with-lease` only because the release branch is a disposable review branch that must stay identical to a commit already on `master`.

5. After the PR is approved, merge to `master`.

   ```bash
   git switch master
   git merge --ff-only release/v0.1.0
   git push origin master
   ```

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

Use this sequence when the automatic helper is unavailable, especially on Windows. It merges the reviewed release commit to `master` directly.

1. Fetch the latest release refs.

   ```bash
   git fetch origin master --prune
   ```

2. Resolve the reviewed release commit and record it as `TARGET_SHA`.

   ```bash
   git rev-parse origin/release/v0.1.0^{commit}
   # or
   git rev-parse release/v0.1.0^{commit}
   # or
   git rev-parse <target-ref>^{commit}
   ```

3. Confirm the release commit already exists on `origin/master`.

   ```bash
   git merge-base --is-ancestor <TARGET_SHA> origin/master
   ```

4. The release branch merge target is `master`.

5. Confirm the release tag does not already exist locally or on `origin`.

   ```bash
   git rev-parse --verify --quiet refs/tags/v0.1.0
   git ls-remote --exit-code --tags origin refs/tags/v0.1.0
   ```

   Both commands should report that the tag is missing before you continue.

6. Merge to `master` locally.

   ```bash
   git switch master
   git merge --ff-only <TARGET_SHA>
   git push origin master
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

- Enable **Require linear history** on `master`.
- Keep PR checks required for PRs targeting `master`.

## CI Guardrails

- PRs targeting `master` must come from `release/<version>` branches.
- The head commit of a PR targeting `master` must already be contained in `origin/master`.
- Release tags must point to commits that are already reachable from `origin/master`.

These rules are enforced in the repository workflows so the documented flow and the automation stay aligned.

## History Hygiene

Use first-parent history for day-to-day inspection:

```bash
git log --oneline --decorate --first-parent master -n 30
```

Avoid using `git log --all --decorate --graph` as the default project view because old release merges and stale branch refs make it noisier than the actual mainline history.

Clean up short-lived branches after they are merged:

```bash
git fetch --prune origin
git branch --merged master
```
