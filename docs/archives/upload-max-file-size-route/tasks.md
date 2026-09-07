# Tasks: upload-max-file-size-route

- [x] Trace the failing fetch: `UploadFileSettingsSection` → `getMaxFileSize` →
      `config.getMaxFileSize` → daemon → `dispatchConfigRoute` default → `undefined`.
- [x] Identify root cause: route missing from `DESKTOP_ONLY_ROUTE_PREFIXES` while its
      write-side sibling `config.setMaxFileSize` is desktop-only.
- [x] Add `"config.getMaxFileSize"` to `DESKTOP_ONLY_ROUTE_PREFIXES`.
- [x] Contracts guard tests (3 passed) + lint + typecheck.
