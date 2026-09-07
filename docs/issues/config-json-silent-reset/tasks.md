# Tasks: config-json-silent-reset

- [x] Atomic `save()` (tmp + rename).
- [x] `load()` preserves corrupt files + logs loudly instead of silent reset.
- [x] Daemon tests: corrupt file → sidecar + defaults; non-object payload; api-key round trip without `.tmp` leftover.
- [x] Gates: daemon suite + format + lint + typecheck.
