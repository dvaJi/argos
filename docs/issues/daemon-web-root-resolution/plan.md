# Plan

## Approach

- Add a small web-root resolver in the daemon startup path.
- Prefer explicit `--web-root` / `ARGOS_WEB_ROOT`.
- For implicit `--web`, search likely local and packaged locations:
  - `web` relative to the current working directory
  - `apps/desktop/out/web` relative to the current working directory
  - `web` next to the daemon executable
- Validate the selected root by requiring `index.html`.
- Throw an actionable startup error before `serve()` if validation fails.

## Interfaces

- CLI flags remain unchanged.
- `ARGOS_WEB_ROOT` remains unchanged.
- Help text changes only to explain default resolution.

## Test Strategy

- Add unit coverage for web-root resolution.
- Run daemon tests, format, and lint after implementation.
