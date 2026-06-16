# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# Testing
- Add a `vite-env.d.ts` (or extend `src/main/env.d.ts`) with `declare module '*?raw' { const content: string; export default content; }` before importing `*.svg?raw` / `*.json?raw` / etc. in test files — the project has no ambient declaration for Vite's `?raw` suffix, so TypeScript fails with TS2307 even though vitest runs fine. Confidence: 0.90

# Lint Workflow
- Before mass-applying any regex/transform script to fix lint warnings, run `pnpm run typecheck` and record the baseline error count; after the script, re-run typecheck and confirm the count is unchanged (or only pre-existing TS2589 errors decreased). The user has been burned twice by over-broad transforms that silently broke `this.method` bindings, void-returning callbacks, and `unknown[]` typing — they explicitly called out "you did it bad at start" when a script introduced hundreds of new TypeScript errors. Confidence: 0.85
- When using `oxlint`, use `-f stylish` (or default) to get the rule name in the output (it appears at end of each line as `plugin(rule-name)`). The `-f json` output strips rule names, which makes rule-by-rule counting much harder. Confidence: 0.70
- This project uses `pnpm run typecheck` (which runs `tsgo --noEmit -p tsconfig.node.json --composite false` and `tsconfig.web.json`) and `pnpm run lint` (`oxlint .`). Always run both before claiming a change is clean. Confidence: 0.75
