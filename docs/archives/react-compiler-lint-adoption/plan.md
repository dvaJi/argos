# React Compiler Lint Adoption — Plan

## Verified compiler-analysis semantics (probed with oxlint 1.80.0)

Empirical probe results that drive every fix below:

| Code shape in component/hook | Result |
| --- | --- |
| Sync `setState` directly in effect body | ❌ `set-state-in-effect` |
| Calling a function declared in component scope that (transitively) calls `setState` — even after `await` | ❌ `set-state-in-effect` |
| `setState` inside `.then()` continuation in effect | ✅ |
| Async IIFE declared **inside** the effect, `await` before `setState`, `cancelled` guard | ✅ |
| Calling a **module-scope** function (same file or imported) — opaque to analysis | ✅ |
| `setState` in event/subscription/`setTimeout`/`queueMicrotask` callbacks | ✅ |
| Ref writes in effects | ✅ |
| Adjusting state during render (prev-compare pattern) | ✅ |
| Lazy `useState(() => ...)` initializer | ✅ |
| `try`/`finally` (with or without `catch`) anywhere in analyzed code | ❌ `react(todo)` |
| `throw` inside `try` that has no `catch` (try/finally) | ❌ `react(todo)` |
| `try`/`catch` + `throw e` in the catch clause | ✅ (but bare `catch { throw e; }` trips `no-useless-catch`) |
| Object literal getters | ❌ `react(todo)` |
| Logical assignment operators (`||=` etc.) | ❌ `react(todo)` |
| Function invocation in `useMemo`/`useCallback` deps | ❌ `react(use-memo)` |
| Extra/missing deps per compiler analysis | ❌ `memo-dependencies` / `exhaustive-effect-dependencies` with per-dep labels |

## Canonical fixes

### F1. Data-loading effects (`set-state-in-effect`)
- Loader used only by the effect → dissolve into effect: async IIFE with `cancelled`
  guard, or `client.get().then(...)` chain. Keep `try`/`catch` (never `finally`).
- Loader shared with event handlers → move the async fetch+state logic into a
  **module-scope** helper (opaque); the effect calls it with a `cancelled`-guarded
  apply callback; the event-handler path keeps a thin `useCallback` wrapper.

### F2. Prop/store → draft mirroring (`set-state-in-effect`)
- Pure reflection of props into state → derive during render (`useMemo` or plain
  expression) and keep user edits as a separate override state.
- Draft reset when an identity changes (`provider.id`, `sessionId`, `open`, ...) →
  prev-compare adjustment during render:
  `const [prevKey, setPrevKey] = useState(key); if (key !== prevKey) { setPrevKey(key); reset(); }`
- One-shot fallback for missing APIs (e.g. no `IntersectionObserver`) → lazy
  `useState(() => fallback)` initializer.

### F3. Reset-on-change state (`set-state-in-effect`)
Same prev-compare render adjustment as F2, or derive if no local edits exist.

### F4. Measurement/timer state (`set-state-in-effect`)
- `ResizeObserver` fires on `observe()` → drop manual initial measurement call.
- Clock/now values → `useState(() => Date.now())` + interval/event callbacks only;
  never sync `setNow()` in the effect body.

### F5. Non-render values (`set-state-in-effect`)
Subscription/unsubscribe handles and other non-render values move from `useState`
to `useRef`.

### F6. `try`/`finally` (`react(todo)`, 105 sites)
- Preferred: convert to `try`/`catch` where the cleanup runs on both paths —
  `try { X; cleanup(); } catch (e) { cleanup(); throw e; }` (valid: throw in catch is
  supported; catch does more than rethrow so `no-useless-catch` stays quiet).
- Where duplication is ugly or flow is complex: extract the block into a
  **module-scope** helper (same file is fine; module-scope code is not analyzed).
- `throw` inside `try` with only `finally` → add the catch/rethrow form above.
- Object getters → replace with methods or plain properties/computed values.
- `||=`/`&&=`/`??=` → expand to plain assignments.

### F7. Deps alignment (`memo-dependencies`, `exhaustive-effect-dependencies`, `use-memo`)
- "Unnecessary dependency `X`" → remove `X` from the dep array (ref objects, store
  objects, values unused by the callback).
- "Missing dependency `X`" →
  1. If `X` is a stable value (state, store field, module fn): add it.
  2. If `X` is unstable and must not retrigger (e.g. latest callback): latest-ref
     pattern (`useRef` updated during render or in the effect) or stabilize `X`
     with `useCallback`/`useMemo`.
  3. If adding `X` changes behavior deliberately-guarded effects, restructure per F1.
- Function invocations in deps (`[getSortedProviders()]`) → hoist the call into the
  render body (`const sorted = getSortedProviders()`) and depend on `[sorted]`.
- After dep changes, re-check the effect body for stale-closure hazards (the reason
  the dep was omitted originally).

### F8. Stale suppressions (`react(rule-suppression)`, 6 sites)
Delete the `eslint-disable-next-line react-hooks/exhaustive-deps` /
`react-doctor-disable-next-line` comments and fix the deps/issue they hid (F7).

## Execution

1. Update `.oxlintrc.json` (enable all 22 rules as errors; keep
   `react/exhaustive-deps` off and `no-unused-vars` off).
2. Pilot fixes by the lead agent on the most complex files to validate patterns:
   `ChatStatusBar.tsx`, `AcpSettings.tsx`, the 6 `rule-suppression` files,
   `_main.tsx`, `NewThreadPage.tsx`, `BrowserPanel.tsx`.
3. Remaining files fixed in parallel batches partitioned by file (no overlapping
   editors), each batch given: per-file diagnostic list (rule, line, labels), the
   canonical fixes F1–F8, and a verification loop of
   `bunx oxlint <files> --format=unix` → 0 findings + `bunx oxfmt` on touched files.
4. Whole-repo verification: `bun run lint`, `bun run format:check`,
   `bun run typecheck`, `bun test` + desktop/UI Vitest.

## Compatibility / risk

- Dep tightening can re-fire effects that were previously under-firing (bug fixes)
  or fire more often; mitigated by stabilizing dependencies instead of blindly
  adding them, and by the test suites.
- `react/todo` fixes preserve semantics: catch/rethrow conversion runs cleanup on
  both paths exactly like `finally`; module-scope extraction is opaque and inert.
- No public API or contract changes; UI-only + landing-page code.
