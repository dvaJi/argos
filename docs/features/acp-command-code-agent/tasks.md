# Command Code as ACP Agent — Tasks

- [x] 1. Curated overlay data (`packages/acp-runtime/src/config/acpCuratedAgents.ts`)
  - [x] 1.1 Command Code record: id `command-code`, `npx command-code@1.89.1` + `acp` args,
        docs/website/repository metadata
- [x] 2. Registry service merge (`acpRegistryService.ts`)
  - [x] 2.1 `applyManifest` + `mergeCuratedAgents`; route all manifest assignments through the
        merge (built-in seed, cache, upstream refresh, lazy fallback)
- [x] 3. Tests (`apps/desktop/test/main/presenter/configPresenter/acpRegistryService.test.ts`)
  - [x] 3.1 Curated agent appears with built-in seed lacking it
  - [x] 3.2 Curated agent survives upstream refresh lacking it
  - [x] 3.3 Upstream entry with the same id wins
- [x] 4. Gates
  - [x] 4.1 acp-runtime + desktop typecheck, desktop targeted Vitest (9/9), `bun run lint`,
        `bun run format`
