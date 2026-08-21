# Taste

- Prefers the codebase to use base-ui for UI primitives; code still using the old radix-ui implementation/patterns should be migrated to base-ui (e.g., tabs). Confidence: 0.9
- Prefers `style.css` (design tokens/theme) to match the official shadcn ui style.css — simple, canonical semantic vars (`--background`, `--card`, `--sidebar`, etc.) — and regards custom re-declarations of Tailwind defaults, duplicated `--color-*`/`--radius-*` blocks, and legacy theme variables as noise ("too many repeated stuff... missing some of them or giving bad variables"). Confidence: 0.85
- Treats the official shadcn/ui reference files (registry `style.css`, component sources) as the source of truth for correct styling setup; deviations from them are called out as problems. Confidence: 0.75
- Uses shadcn wrapper components (imported from `@/components/ui/*`, e.g. `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent`) rather than importing base-ui primitives directly; the canonical shadcn usage pattern (e.g. `defaultValue` + one `TabsContent` per tab) is the reference for correct usage. Confidence: 0.75
- Prefers aggressive removal of dead/legacy code without hedging or per-item confirmation — "remove everything dead/legacy, i will tell you if something is broken" — i.e., the user will catch regressions themselves, so the agent should just execute the cleanup decisively. Confidence: 0.8
