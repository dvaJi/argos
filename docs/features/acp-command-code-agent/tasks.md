# Command Code as ACP Agent — Tasks

- [x] 1. Curated overlay data (`packages/acp-runtime/src/config/acpCuratedAgents.ts`)
  - [x] 1.1 Command Code record: id `command-code`, unpinned `npx command-code` + `acp` args,
        docs/website/repository metadata
- [x] 2. Registry service merge (`acpRegistryService.ts`)
  - [x] 2.1 `applyManifest` + `mergeCuratedAgents`; route all manifest assignments through the
        merge (built-in seed, cache, upstream refresh, lazy fallback)
- [x] 3. Tests (`apps/desktop/test/main/presenter/configPresenter/acpRegistryService.test.ts`)
  - [x] 3.1 Curated agent appears with built-in seed lacking it
  - [x] 3.2 Curated agent survives upstream refresh lacking it
  - [x] 3.3 Upstream entry with the same id wins
- [x] 4. Brand icon + UI exception
  - [x] 4.1 Bundled official logomark: `apps/desktop/resources/acp-registry/icons/command-code.svg`
        (symbol.svg from commandcode.ai/brand, 16px box, official fixed colors)
  - [x] 4.2 Curated record `icon` = canonical ACP-CDN URL (passes the icon-URL allowlist;
        bundled file serves markup until upstream registers the agent)
  - [x] 4.3 `AcpAgentIcon` full-bleed exception (`isFullBleedRegistryIcon`): container drops
        `rounded-md`/`overflow-hidden` for tile-style marks; component tests added
- [x] 5. Gates
  - [x] 5.1 acp-runtime + desktop + ui typecheck, desktop targeted Vitest (9/9), ui component
        tests, `bun run lint`, `bun run format`
