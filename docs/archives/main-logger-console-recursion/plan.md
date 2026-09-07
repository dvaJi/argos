# Plan

- Capture the original console methods before defining the logger fallback.
- Route non-Electron fallback output through those captured methods.
- Add a focused main-process Vitest regression test that forces the fallback
  path and confirms one error is emitted without recursion.

