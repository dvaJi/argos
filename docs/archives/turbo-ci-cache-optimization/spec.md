# Turbo CI cache optimization

## Problem

CI configures Turborepo remote cache credentials, but the desktop Vite build is invoked outside Turbo.
Each platform/architecture job installs dependencies twice and recompiles identical desktop output in
parallel. Packaging failures therefore consume expensive runners and fan out into several failures before
static packaging configuration is validated.

## Acceptance criteria

- The root build command delegates to `turbo run` and restores `apps/desktop/out/**` from cache.
- Desktop build hashes include every `VITE_*` value that changes emitted output.
- Desktop and daemon packages own their output and environment declarations.
- A preflight job builds and validates the desktop package before platform packaging jobs begin.
- Platform jobs use pnpm store, Turbo, Electron Builder, and runtime caches without caching `node_modules`.
- Platform jobs build the target daemon before Electron Builder packages it.
- PR checks use Turbo affected execution where history is available.
- Stale workflow runs are cancelled by concurrency groups.
- Build, PR, release, and Windows ARM64 workflows share one setup implementation.

## Non-goals

- Caching signed installers or final release artifacts as Turbo task outputs.
- Sharing native `node_modules` across operating systems or architectures.
- Enabling remote-cache artifact signing without a configured repository signing secret.

## Constraints

- Desktop Vite output is platform-independent; daemon binaries, runtimes, native modules, and installers
  remain platform-specific.
- GitHub cache is a fallback for environments where remote-cache credentials are unavailable.
- Mutable remote provider/ACP data must not make a supposedly deterministic cached build change output.

