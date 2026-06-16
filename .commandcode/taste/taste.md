# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# Testing
- Add a `vite-env.d.ts` (or extend `src/main/env.d.ts`) with `declare module '*?raw' { const content: string; export default content; }` before importing `*.svg?raw` / `*.json?raw` / etc. in test files — the project has no ambient declaration for Vite's `?raw` suffix, so TypeScript fails with TS2307 even though vitest runs fine. Confidence: 0.90
