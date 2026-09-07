# React Doctor Pi settings remediation

## Goal

Remove React Doctor errors introduced by the Pi settings changes without changing request, loading, error, or result behavior.

## Acceptance criteria

- The affected components contain no compiler-blocking `try/finally` action handlers.
- Pi package loading does not synchronously clear state at effect start.
- Formatting, lint, type checking, and the React Doctor diff check pass without new findings.

## Non-goals

- Redesigning the Agent Settings UI or altering Pi package semantics.
